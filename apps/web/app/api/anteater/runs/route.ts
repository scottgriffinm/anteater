import { NextResponse } from "next/server";
import type { AnteaterRun, AnteaterRunsResponse } from "@anteater/next";

function getRepo(): string | undefined {
  if (process.env.ANTEATER_GITHUB_REPO) return process.env.ANTEATER_GITHUB_REPO;
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  if (owner && slug) return `${owner}/${slug}`;
  return undefined;
}

/**
 * GET /api/anteater/runs
 *
 * Uses GitHub workflow runs as the source of truth — no timers.
 *
 * Statuses derived from actual GitHub state:
 *   - workflow in_progress, no PR          → "working"
 *   - workflow in_progress, PR open        → "merging"
 *   - workflow completed+success, PR open  → "merging"
 *   - workflow completed+success, PR merged, same deploymentId → "redeploying"
 *   - workflow completed+failure           → "error"
 *   - deploymentId changed (client-side)   → page reloads
 *
 * A run disappears from the list when:
 *   - workflow failed (shown briefly as error, then gone on next completed-only fetch)
 *   - PR merged + client detects new deploymentId → page reloads
 *   - PR closed without merge
 */
export async function GET() {
  const repo = getRepo();
  const token = process.env.GITHUB_TOKEN;

  if (!repo || !token) {
    return NextResponse.json<AnteaterRunsResponse>(
      { runs: [], deploymentId: process.env.VERCEL_DEPLOYMENT_ID },
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
    // 1. Fetch in-progress workflow runs (the real active runs)
    const inProgressRes = await gh(
      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?status=in_progress&per_page=5`,
    );
    const inProgressRuns: Array<{
      id: number;
      head_branch: string;
      status: string;
      conclusion: string | null;
    }> = inProgressRes.ok
      ? (await inProgressRes.json()).workflow_runs ?? []
      : [];

    // 2. Fetch recently completed workflow runs (to catch merging/redeploying)
    const completedRes = await gh(
      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?status=completed&per_page=5`,
    );
    const completedRuns: Array<{
      id: number;
      head_branch: string;
      status: string;
      conclusion: string | null;
      updated_at: string;
    }> = completedRes.ok
      ? (await completedRes.json()).workflow_runs ?? []
      : [];

    // 3. Fetch PRs for all anteater branches to get prompt + merge state
    const prsRes = await gh(
      `https://api.github.com/repos/${repo}/pulls?state=all&per_page=20&sort=created&direction=desc`,
    );
    const allPrs: Array<{
      head: { ref: string };
      title: string;
      state: string;
      merged_at: string | null;
    }> = prsRes.ok ? await prsRes.json() : [];

    const prByBranch = new Map(
      allPrs
        .filter((pr) => pr.head.ref.startsWith("anteater/"))
        .map((pr) => [pr.head.ref, pr]),
    );

    const runs: AnteaterRun[] = [];
    const seen = new Set<string>();

    // Process in-progress workflows first (these are definitively active)
    for (const wf of inProgressRuns) {
      const branch = wf.head_branch;
      if (seen.has(branch)) continue;
      seen.add(branch);

      const pr = prByBranch.get(branch);
      const parts = branch.split("-");
      const requestId = parts[parts.length - 1] || "";
      const mode = branch.includes("friend-") ? "copy" as const : "prod" as const;
      const prompt = pr?.title?.replace(/^anteater:\s*/i, "") || "Starting...";

      // Workflow is running — check if PR exists yet
      const step = pr ? "merging" : "working";

      runs.push({ branch, requestId, prompt, step, mode });
      if (runs.length >= 5) break;
    }

    // Process recently completed successful workflows (may be in merging/redeploying)
    for (const wf of completedRuns) {
      if (runs.length >= 5) break;
      const branch = wf.head_branch;
      if (seen.has(branch)) continue;
      if (!branch.startsWith("anteater/")) continue;
      seen.add(branch);

      if (wf.conclusion !== "success") continue; // failed runs — skip

      const pr = prByBranch.get(branch);
      if (!pr) continue; // no PR = nothing to show

      // PR state determines what's happening
      if (pr.merged_at) {
        // Merged — currently redeploying (client will detect new deploymentId and reload)
        const parts = branch.split("-");
        const requestId = parts[parts.length - 1] || "";
        const mode = branch.includes("friend-") ? "copy" as const : "prod" as const;
        const prompt = pr.title?.replace(/^anteater:\s*/i, "") || "";

        runs.push({ branch, requestId, prompt, step: "redeploying", mode });
      } else if (pr.state === "open") {
        // Workflow done, PR still open — waiting for auto-merge
        const parts = branch.split("-");
        const requestId = parts[parts.length - 1] || "";
        const mode = branch.includes("friend-") ? "copy" as const : "prod" as const;
        const prompt = pr.title?.replace(/^anteater:\s*/i, "") || "";

        runs.push({ branch, requestId, prompt, step: "merging", mode });
      }
      // closed without merge — skip
    }

    return NextResponse.json<AnteaterRunsResponse>({
      runs,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    });
  } catch (err) {
    console.error("[anteater] /runs error:", err);
    return NextResponse.json<AnteaterRunsResponse>({
      runs: [],
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    });
  }
}
