import { NextRequest, NextResponse } from "next/server";
import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "@anteater/next";

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
    return NextResponse.json<AnteaterStatusResponse>(
      { step: "error", completed: true, error: "Missing branch param" },
      { status: 400 },
    );
  }

  const repo = process.env.ANTEATER_GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
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
    // Step 1: Check if the branch exists yet (agent pushes it when done)
    const branchRes = await gh(
      `https://api.github.com/repos/${repo}/git/refs/heads/${branch}`,
    );

    if (!branchRes.ok) {
      // Branch doesn't exist — check if the workflow is still running or failed
      const runsRes = await gh(
        `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?per_page=5`,
      );
      if (runsRes.ok) {
        const { workflow_runs: runs } = await runsRes.json();
        // Find a recent failed run (within last 5 minutes)
        const recentFailed = runs?.find(
          (r: { status: string; conclusion: string; created_at: string }) =>
            r.status === "completed" &&
            r.conclusion === "failure" &&
            Date.now() - new Date(r.created_at).getTime() < 5 * 60 * 1000,
        );
        if (recentFailed) {
          return NextResponse.json<AnteaterStatusResponse>({
            step: "error",
            completed: true,
            error: "Workflow failed — check GitHub Actions for details",
          });
        }
      }
      // Still running
      return NextResponse.json<AnteaterStatusResponse>({ step: "working", completed: false });
    }

    // Branch exists — Step 2: Check for a PR
    const prRes = await gh(
      `https://api.github.com/repos/${repo}/pulls?head=${repo.split("/")[0]}:${branch}&state=all&per_page=1`,
    );

    if (!prRes.ok) {
      return NextResponse.json<AnteaterStatusResponse>({ step: "merging", completed: false });
    }

    const prs = await prRes.json();
    if (!prs.length) {
      // Branch pushed but PR not created yet
      return NextResponse.json<AnteaterStatusResponse>({ step: "merging", completed: false });
    }

    const pr = prs[0];

    // Step 3: Check if PR is merged
    if (pr.merged_at) {
      // PR is merged — Vercel is redeploying.
      // Give Vercel ~30s to deploy, then mark as done.
      const mergedAgo = Date.now() - new Date(pr.merged_at).getTime();
      if (mergedAgo > 30_000) {
        return NextResponse.json<AnteaterStatusResponse>({ step: "done", completed: true });
      }
      return NextResponse.json<AnteaterStatusResponse>({ step: "redeploying", completed: false });
    }

    if (pr.state === "closed") {
      return NextResponse.json<AnteaterStatusResponse>({
        step: "error",
        completed: true,
        error: "PR was closed without merging",
      });
    }

    // PR open, not yet merged
    return NextResponse.json<AnteaterStatusResponse>({ step: "merging", completed: false });
  } catch {
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

    // Auth check — browsers set Sec-Fetch-Site automatically (can't be spoofed)
    // "same-origin" = request came from the same site (the AnteaterBar)
    const secret = process.env.ANTEATER_SECRET;
    if (secret) {
      const fetchSite = request.headers.get("sec-fetch-site");
      const isSameOrigin = fetchSite === "same-origin";

      if (!isSameOrigin) {
        const authHeader = request.headers.get("x-anteater-secret");
        if (authHeader !== secret) {
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

    return NextResponse.json<AnteaterResponse>({
      requestId,
      branch,
      status: "queued",
    });
  } catch {
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
