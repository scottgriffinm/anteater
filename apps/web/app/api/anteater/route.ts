import { NextRequest, NextResponse } from "next/server";
import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "@anteater/next";

function log(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...data };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/**
 * GET /api/anteater?branch=anteater/run-xxx
 *
 * Polls real pipeline status by checking concrete GitHub state:
 *   1. Does the branch exist?  No  → agent is still working ("initializing" / "working")
 *   2. Does a PR exist?        No  → PR being created ("merging")
 *   3. Is the PR merged?       No  → waiting for merge ("merging")
 *   4. PR merged               Yes → Vercel is redeploying ("redeploying" → "done")
 *
 * We also check for workflow failures to surface real errors.
 */
export async function GET(request: NextRequest) {
  const branch = request.nextUrl.searchParams.get("branch");
  if (!branch) {
    log("warn", "GET /api/anteater — missing branch param");
    return NextResponse.json<AnteaterStatusResponse>(
      { step: "error", completed: true, error: "Missing branch param" },
      { status: 400 },
    );
  }

  const repo = process.env.ANTEATER_GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    log("error", "GET /api/anteater — server misconfigured", { hasRepo: !!repo, hasToken: !!token });
    return NextResponse.json<AnteaterStatusResponse>(
      { step: "error", completed: true, error: "Server misconfigured" },
      { status: 500 },
    );
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

        // PR merged → check if Vercel has deployed the new code
        if (pr.merged_at) {
          const mergedAt = new Date(pr.merged_at).getTime();
          const mergedAgo = Date.now() - mergedAt;

          // Check Vercel deployment status if token is available
          const vercelToken = process.env.ANTEATER_VERCEL_TOKEN;
          const vercelProjectId = process.env.VERCEL_PROJECT_ID;

          if (vercelToken && vercelProjectId) {
            try {
              const vercelRes = await fetch(
                `https://api.vercel.com/v6/deployments?projectId=${vercelProjectId}&limit=1&target=production`,
                {
                  headers: { Authorization: `Bearer ${vercelToken}` },
                  cache: "no-store",
                },
              );

              if (vercelRes.ok) {
                const { deployments } = await vercelRes.json();
                const latest = deployments?.[0];

                if (latest) {
                  const deployCreated = new Date(latest.created).getTime();
                  // Deployment must have been created AFTER the PR merge to be the right one
                  const isPostMerge = deployCreated > mergedAt;
                  const isReady = latest.readyState === "READY" || latest.state === "READY";

                  log("info", "GET /api/anteater — Vercel deployment check", {
                    branch, prNumber: pr.number, mergedAgo,
                    deployState: latest.readyState || latest.state,
                    deployCreated: latest.created, isPostMerge, isReady,
                  });

                  if (isPostMerge && isReady) {
                    return NextResponse.json<AnteaterStatusResponse>({ step: "done", completed: true });
                  }

                  // Either still waiting for Vercel to start building,
                  // or the build is in progress
                  return NextResponse.json<AnteaterStatusResponse>({ step: "redeploying", completed: false });
                }
              }
            } catch (vercelErr) {
              log("warn", "GET /api/anteater — Vercel API check failed, falling back to timer", {
                error: String(vercelErr),
              });
            }
          }

          // Fallback: no Vercel token configured, use conservative timer
          const step = mergedAgo > 150_000 ? "done" : "redeploying";
          log("info", "GET /api/anteater — PR merged (timer fallback)", { branch, prNumber: pr.number, mergedAgo, step });
          if (step === "done") {
            return NextResponse.json<AnteaterStatusResponse>({ step: "done", completed: true });
          }
          return NextResponse.json<AnteaterStatusResponse>({ step: "redeploying", completed: false });
        }

        if (pr.state === "closed") {
          log("warn", "GET /api/anteater — PR closed without merge", { branch, prNumber: pr.number });
          return NextResponse.json<AnteaterStatusResponse>({
            step: "error",
            completed: true,
            error: "PR was closed without merging",
          });
        }

        // PR open, not yet merged
        log("info", "GET /api/anteater — PR open, waiting for merge", { branch, prNumber: pr.number });
        return NextResponse.json<AnteaterStatusResponse>({ step: "merging", completed: false });
      }
    }

    // No PR yet — Step 2: Check if branch exists (agent pushes it when done)
    const branchRes = await gh(
      `https://api.github.com/repos/${repo}/git/refs/heads/${branch}`,
    );

    if (branchRes.ok) {
      // Branch pushed but no PR yet — PR is being created
      log("info", "GET /api/anteater — branch exists, PR being created", { branch });
      return NextResponse.json<AnteaterStatusResponse>({ step: "merging", completed: false });
    }

    // No branch, no PR — Step 3: Check if the workflow failed
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
        return NextResponse.json<AnteaterStatusResponse>({
          step: "error",
          completed: true,
          error: "Workflow failed — check GitHub Actions for details",
        });
      }
    }

    // Still running — agent working on changes
    log("info", "GET /api/anteater — still working", { branch });
    return NextResponse.json<AnteaterStatusResponse>({ step: "working", completed: false });
  } catch (err) {
    log("error", "GET /api/anteater — status check failed", { branch, error: String(err) });
    return NextResponse.json<AnteaterStatusResponse>(
      { step: "error", completed: true, error: "Status check failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AnteaterRequest = await request.json();

    if (!body.prompt?.trim()) {
      log("warn", "POST /api/anteater — empty prompt");
      return NextResponse.json<AnteaterResponse>(
        {
          requestId: "",
          branch: "",
          status: "error",
          error: "Prompt is required",
        },
        { status: 400 }
      );
    }

    log("info", "POST /api/anteater — received request", { prompt: body.prompt, mode: body.mode });

    // Auth check — browsers set Sec-Fetch-Site automatically (can't be spoofed)
    // "same-origin" = request came from the same site (the AnteaterBar)
    const secret = process.env.ANTEATER_SECRET;
    if (secret) {
      const fetchSite = request.headers.get("sec-fetch-site");
      const isSameOrigin = fetchSite === "same-origin";

      if (!isSameOrigin) {
        const authHeader = request.headers.get("x-anteater-secret");
        if (authHeader !== secret) {
          log("warn", "POST /api/anteater — unauthorized request", { fetchSite });
          return NextResponse.json<AnteaterResponse>(
            {
              requestId: "",
              branch: "",
              status: "error",
              error: "Unauthorized",
            },
            { status: 401 }
          );
        }
      }
    }

    const repo = process.env.ANTEATER_GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;

    if (!repo || !token) {
      log("error", "POST /api/anteater — server misconfigured", { hasRepo: !!repo, hasToken: !!token });
      return NextResponse.json<AnteaterResponse>(
        {
          requestId: "",
          branch: "",
          status: "error",
          error: "Server misconfigured: missing ANTEATER_GITHUB_REPO or GITHUB_TOKEN",
        },
        { status: 500 }
      );
    }

    const requestId = crypto.randomUUID().slice(0, 8);
    const branch =
      body.mode === "copy"
        ? `anteater/friend-${requestId}`
        : `anteater/run-${requestId}`;

    log("info", "POST /api/anteater — dispatching workflow", { requestId, branch, prompt: body.prompt });

    // Dispatch GitHub Actions workflow
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
      }
    );

    if (!dispatchRes.ok) {
      const err = await dispatchRes.text();
      log("error", "POST /api/anteater — GitHub dispatch failed", { requestId, status: dispatchRes.status, error: err });
      return NextResponse.json<AnteaterResponse>(
        {
          requestId,
          branch,
          status: "error",
          error: `GitHub dispatch failed: ${dispatchRes.status} ${err}`,
        },
        { status: 502 }
      );
    }

    log("info", "POST /api/anteater — workflow dispatched successfully", { requestId, branch });

    return NextResponse.json<AnteaterResponse>({
      requestId,
      branch,
      status: "queued",
    });
  } catch (err) {
    log("error", "POST /api/anteater — request failed", { error: String(err) });
    return NextResponse.json<AnteaterResponse>(
      {
        requestId: "",
        branch: "",
        status: "error",
        error: "Invalid request body",
      },
      { status: 400 }
    );
  }
}
