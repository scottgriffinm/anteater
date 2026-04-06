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
 * Discovers all active anteater runs by listing anteater/* branches
 * and cross-referencing with PRs. Returns up to 5 active runs.
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
    const owner = repo.split("/")[0];

    // 1. List all anteater/* branches (single API call)
    const refsRes = await gh(
      `https://api.github.com/repos/${repo}/git/matching-refs/heads/anteater/`,
    );
    const refs: Array<{ ref: string }> = refsRes.ok ? await refsRes.json() : [];

    // 2. Fetch recent PRs with anteater head branches (single API call)
    const prsRes = await gh(
      `https://api.github.com/repos/${repo}/pulls?state=all&per_page=20&sort=created&direction=desc`,
    );
    const allPrs: Array<{
      head: { ref: string };
      title: string;
      state: string;
      merged_at: string | null;
      created_at: string;
      number: number;
    }> = prsRes.ok ? await prsRes.json() : [];

    const anteaterPrs = allPrs.filter((pr) => pr.head.ref.startsWith("anteater/"));
    const prByBranch = new Map(anteaterPrs.map((pr) => [pr.head.ref, pr]));

    // 3. Fetch recent workflow runs to identify actively running branches (1 API call)
    const wfRes = await gh(
      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?per_page=10&status=in_progress`,
    );
    const activeWorkflows: Array<{ head_branch: string }> = wfRes.ok
      ? (await wfRes.json()).workflow_runs ?? []
      : [];
    const activeBranches = new Set(activeWorkflows.map((w) => w.head_branch));

    // 4. Build runs list
    const runs: AnteaterRun[] = [];
    const branchNames = refs.map((r) => r.ref.replace("refs/heads/", ""));

    // Also include branches we only know about via PRs (branch may be deleted after merge)
    for (const pr of anteaterPrs) {
      if (!branchNames.includes(pr.head.ref)) {
        branchNames.push(pr.head.ref);
      }
    }

    for (const branch of branchNames) {
      const pr = prByBranch.get(branch);
      const parts = branch.split("-");
      const requestId = parts[parts.length - 1] || "";
      const mode = branch.includes("friend-") ? "copy" as const : "prod" as const;

      let step: AnteaterRun["step"];

      if (pr?.merged_at) {
        const mergedAgo = Date.now() - new Date(pr.merged_at).getTime();
        if (mergedAgo > 300_000) continue; // merged > 5 min ago, stale
        step = mergedAgo > 150_000 ? "done" : "redeploying";
      } else if (pr?.state === "closed") {
        continue; // closed without merge, skip
      } else if (pr) {
        // Open PR — but if it's been open > 30 min, it's probably stuck
        const prAge = Date.now() - new Date(pr.created_at).getTime();
        if (prAge > 30 * 60 * 1000) continue;
        step = "merging";
      } else {
        // Branch with no PR — only show if there's an actively running workflow for it
        if (!activeBranches.has(branch)) continue;
        step = "working";
      }

      const prompt = pr?.title?.replace(/^anteater:\s*/i, "") || "Starting...";

      runs.push({ branch, requestId, prompt, step, mode });

      if (runs.length >= 5) break;
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
