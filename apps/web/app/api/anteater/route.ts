import { NextRequest, NextResponse } from "next/server";
import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "@anteater/next";

function log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...data };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/** Auto-detect repo from Vercel system env vars, fall back to ANTEATER_GITHUB_REPO */
function getRepo(): string | undefined {
  if (process.env.ANTEATER_GITHUB_REPO) return process.env.ANTEATER_GITHUB_REPO;
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  if (owner && slug) return `${owner}/${slug}`;
  return undefined;
}

/** Return a status response with the current deployment ID attached */
function status(body: AnteaterStatusResponse, httpStatus?: number) {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  return NextResponse.json({ ...body, deploymentId }, httpStatus ? { status: httpStatus } : undefined);
}

/**
 * GET /api/anteater?branch=anteater/run-xxx
 *
 * Polls pipeline status via GitHub state. Deploy detection is handled
 * client-side by comparing VERCEL_DEPLOYMENT_ID across poll responses.
 */
export async function GET(request: NextRequest) {
  const branch = request.nextUrl.searchParams.get("branch");
  if (!branch) {
    log("warn", "GET /api/anteater — missing branch param");
    return status({ step: "error", completed: true, error: "Missing branch param" }, 400);
  }

  const repo = getRepo();
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    log("error", "GET /api/anteater — server misconfigured", { hasRepo: !!repo, hasToken: !!token });
    return status({ step: "error", completed: true, error: "Server misconfigured" }, 500);
  }

  const gh = (url: string) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

  try {
    // Step 1: Check for a PR first (survives branch deletion after merge)
    const prRes = await gh(
      `https://api.github.com/repos/${repo}/pulls?head=${repo.split("/")[0]}:${branch}&state=all&per_page=1`,
    );

    if (prRes.ok) {
      const prs = await prRes.json();
      if (prs.length) {
        const pr = prs[0];

        if (pr.merged_at) {
          const mergedAgo = Date.now() - new Date(pr.merged_at).getTime();
          // Client detects deploy via deployment ID change.
          // Use 150s timer as final fallback for non-Vercel environments.
          const step = mergedAgo > 150_000 ? "done" : "redeploying";
          log("info", "GET /api/anteater — PR merged", { branch, prNumber: pr.number, mergedAgo, step });
          return status({ step, completed: step === "done" });
        }

        if (pr.state === "closed") {
          log("warn", "GET /api/anteater — PR closed without merge", { branch, prNumber: pr.number });
          return status({ step: "error", completed: true, error: "PR was closed without merging" });
        }

        log("info", "GET /api/anteater — PR open, waiting for merge", { branch, prNumber: pr.number });
        return status({ step: "merging", completed: false });
      }
    }

    // No PR yet — check if branch exists
    const branchRes = await gh(
      `https://api.github.com/repos/${repo}/git/refs/heads/${branch}`,
    );
    if (branchRes.ok) {
      log("info", "GET /api/anteater — branch exists, PR being created", { branch });
      return status({ step: "merging", completed: false });
    }

    // No branch, no PR — check for workflow failures
    const runsRes = await gh(
      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?per_page=5`,
    );
    if (runsRes.ok) {
      const { workflow_runs: runs } = await runsRes.json();
      const recentFailed = runs?.find(
        (r: { status: string; conclusion: string; created_at: string }) =>
          r.status === "completed" &&
          r.conclusion === "failure" &&
          Date.now() - new Date(r.created_at).getTime() < 5 * 60 * 1000,
      );
      if (recentFailed) {
        log("error", "GET /api/anteater — workflow failed", { branch, runId: recentFailed.id });
        return status({ step: "error", completed: true, error: "Workflow failed — check GitHub Actions for details" });
      }
    }

    log("info", "GET /api/anteater — still working", { branch });
    return status({ step: "working", completed: false });
  } catch (err) {
    log("error", "GET /api/anteater — status check failed", { branch, error: String(err) });
    return status({ step: "error", completed: true, error: "Status check failed" }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AnteaterRequest = await request.json();

    if (!body.prompt?.trim()) {
      log("warn", "POST /api/anteater — empty prompt");
      return NextResponse.json<AnteaterResponse>(
        { requestId: "", branch: "", status: "error", error: "Prompt is required" },
        { status: 400 },
      );
    }

    log("info", "POST /api/anteater — received request", { prompt: body.prompt, mode: body.mode });

    // Auth: same-origin requests are trusted (sec-fetch-site can't be spoofed).
    // External callers must provide x-anteater-secret if ANTEATER_SECRET is set.
    const secret = process.env.ANTEATER_SECRET;
    if (secret) {
      const fetchSite = request.headers.get("sec-fetch-site");
      if (fetchSite !== "same-origin") {
        const authHeader = request.headers.get("x-anteater-secret");
        if (authHeader !== secret) {
          log("warn", "POST /api/anteater — unauthorized request", { fetchSite });
          return NextResponse.json<AnteaterResponse>(
            { requestId: "", branch: "", status: "error", error: "Unauthorized" },
            { status: 401 },
          );
        }
      }
    }

    const repo = getRepo();
    const token = process.env.GITHUB_TOKEN;

    if (!repo || !token) {
      log("error", "POST /api/anteater — server misconfigured", { hasRepo: !!repo, hasToken: !!token });
      return NextResponse.json<AnteaterResponse>(
        { requestId: "", branch: "", status: "error", error: "Server misconfigured: missing GITHUB_TOKEN (and cannot detect repo)" },
        { status: 500 },
      );
    }

    const requestId = crypto.randomUUID().slice(0, 8);
    const branch =
      body.mode === "copy"
        ? `anteater/friend-${requestId}`
        : `anteater/run-${requestId}`;

    log("info", "POST /api/anteater — dispatching workflow", { requestId, branch, repo, prompt: body.prompt });

    const dispatchRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: "master",
          inputs: {
            requestId,
            prompt: body.prompt,
            mode: body.mode || "prod",
            branch,
            baseBranch: "master",
            autoMerge: String(body.mode !== "copy"),
          },
        }),
      },
    );

    if (!dispatchRes.ok) {
      const err = await dispatchRes.text();
      log("error", "POST /api/anteater — GitHub dispatch failed", { requestId, status: dispatchRes.status, error: err });
      return NextResponse.json<AnteaterResponse>(
        { requestId, branch, status: "error", error: `GitHub dispatch failed: ${dispatchRes.status} ${err}` },
        { status: 502 },
      );
    }

    log("info", "POST /api/anteater — workflow dispatched successfully", { requestId, branch });
    return NextResponse.json<AnteaterResponse>({ requestId, branch, status: "queued" });
  } catch (err) {
    log("error", "POST /api/anteater — request failed", { error: String(err) });
    return NextResponse.json<AnteaterResponse>(
      { requestId: "", branch: "", status: "error", error: "Invalid request body" },
      { status: 400 },
    );
  }
}
