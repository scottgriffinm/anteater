/**
 * File scaffolding — generates and writes Anteater files into the target project.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

async function writeIfNotExists(path, content) {
  try {
    await readFile(path);
    return false; // already exists
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
    return true;
  }
}

async function patchRunsRouteDeleteIfMissing(path, isTypeScript) {
  try {
    const existing = await readFile(path, "utf-8");
    if (existing.includes("export async function DELETE(")) {
      return false;
    }
    const patched = `${existing.trimEnd()}\n\n${buildRunsDeleteHandler(isTypeScript)}\n`;
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function patchApiRouteMutationGuardIfMissing(path) {
  try {
    const existing = await readFile(path, "utf-8");
    if (existing.includes("Same-origin guard for mutating Anteater requests")) {
      return false;
    }

    const guardBlock = [
      "    // Same-origin guard for mutating Anteater requests (no app auth integration required)",
      "    const requestOrigin = request.nextUrl.origin;",
      '    const fetchSite = request.headers.get("sec-fetch-site");',
      '    const origin = request.headers.get("origin");',
      '    const referer = request.headers.get("referer");',
      "    const hasMatchingOrigin = origin === requestOrigin;",
      "    const hasMatchingReferer = (() => {",
      "      if (!referer) return false;",
      "      try {",
      "        return new URL(referer).origin === requestOrigin;",
      "      } catch {",
      "        return false;",
      "      }",
      "    })();",
      '    const hasSameOriginBrowserSignal = fetchSite === "same-origin";',
      "    const hasValidSameOriginSignal = hasSameOriginBrowserSignal || hasMatchingOrigin || hasMatchingReferer;",
      "    const secret = process.env.ANTEATER_SECRET;",
      '    const hasValidSecret = !!secret && request.headers.get("x-anteater-secret") === secret;',
      "    if (!hasValidSameOriginSignal && !hasValidSecret) {",
      "      return NextResponse.json(",
      '        { requestId: "", branch: "", status: "error", error: "Forbidden" },',
      "        { status: 403 }",
      "      );",
      "    }",
      "",
    ].join("\n");

    const contentTypeBlock = [
      '    const contentType = request.headers.get("content-type") || "";',
      '    if (!contentType.toLowerCase().includes("application/json")) {',
      "      return NextResponse.json(",
      '        { requestId: "", branch: "", status: "error", error: "Content-Type must be application/json" },',
      "        { status: 415 }",
      "      );",
      "    }",
      "",
    ].join("\n");

    let patched = existing;

    patched = patched.replace(
      "  try {\n    const body",
      `  try {\n${contentTypeBlock}    const body`,
    );

    const oldAuthPattern = /    \/\/ Auth: sec-fetch-site for same-origin \(AnteaterBar\), x-anteater-secret for external[\s\S]*?    const repo = getRepo\(\);/;
    if (oldAuthPattern.test(patched)) {
      patched = patched.replace(oldAuthPattern, `${guardBlock}    const repo = getRepo();`);
    } else {
      patched = patched.replace(
        "    const repo = getRepo();",
        `${guardBlock}    const repo = getRepo();`,
      );
    }

    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function patchRunsRouteMutationGuardIfMissing(path) {
  try {
    const existing = await readFile(path, "utf-8");
    if (
      existing.includes("Same-origin guard for mutating runs endpoint") &&
      existing.includes("export async function DELETE(request") &&
      existing.indexOf("Same-origin guard for mutating runs endpoint") >
        existing.indexOf("export async function DELETE(request")
    ) {
      return false;
    }

    const guardBlock = [
      "  // Same-origin guard for mutating runs endpoint (no app auth integration required)",
      "  const requestOrigin = new URL(request.url).origin;",
      '  const fetchSite = request.headers.get("sec-fetch-site");',
      '  const origin = request.headers.get("origin");',
      '  const referer = request.headers.get("referer");',
      "  const hasMatchingOrigin = origin === requestOrigin;",
      "  const hasMatchingReferer = (() => {",
      "    if (!referer) return false;",
      "    try {",
      "      return new URL(referer).origin === requestOrigin;",
      "    } catch {",
      "      return false;",
      "    }",
      "  })();",
      '  const hasSameOriginBrowserSignal = fetchSite === "same-origin";',
      "  const hasValidSameOriginSignal = hasSameOriginBrowserSignal || hasMatchingOrigin || hasMatchingReferer;",
      "  const secret = process.env.ANTEATER_SECRET;",
      '  const hasValidSecret = !!secret && request.headers.get("x-anteater-secret") === secret;',
      "  if (!hasValidSameOriginSignal && !hasValidSecret) {",
      '    return NextResponse.json({ error: "Forbidden" }, { status: 403 });',
      "  }",
      "",
    ].join("\n");

    const deleteFnPattern =
      /(export async function DELETE\(request[^\n]*\) \{[\s\S]*?if \(!requestId\) \{[\s\S]*?\n  \}\n\s*)/;
    let patched = existing;

    if (deleteFnPattern.test(existing)) {
      patched = existing.replace(deleteFnPattern, `$1${guardBlock}`);
    } else {
      return false;
    }

    // Clean up buggy older patch where guard was accidentally inserted in GET.
    const getGuardPattern =
      /(export async function GET\(\) \{[\s\S]*?)\n  \/\/ Same-origin guard for mutating runs endpoint[\s\S]*?  const gh = \(url/g;
    if (getGuardPattern.test(patched)) {
      patched = patched.replace(getGuardPattern, "$1\n  const gh = (url");
    }

    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function patchRunsRouteFailedTtlIfMissing(path) {
  try {
    const existing = await readFile(path, "utf-8");
    if (existing.includes("failedCutoffMs")) {
      return false;
    }

    const replacement = [
      "    // Sort newest first, cap at 5",
      "    // Drop stale failed runs (>1h) so old errors don't clutter the bar",
      "    const failedCutoffMs = 60 * 60 * 1000;",
      "    const freshRuns = runs.filter((r) => {",
      '      if (r.step !== "error") return true;',
      "      const startedAtMs = new Date(r.startedAt).getTime();",
      "      if (Number.isNaN(startedAtMs)) return true;",
      "      return Date.now() - startedAtMs <= failedCutoffMs;",
      "    });",
      "",
      "    freshRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());",
      "",
      '    return NextResponse.json' + (existing.includes("<AnteaterRunsResponse>") ? "<AnteaterRunsResponse>" : "") + "(",
      "      { runs: freshRuns.slice(0, 5), deploymentId: process.env.VERCEL_DEPLOYMENT_ID }",
      "    );",
    ].join("\n");

    const sortAndReturnPattern =
      /    \/\/ Sort newest first, cap at 5[\s\S]*?    return NextResponse\.json(?:<AnteaterRunsResponse>)?\([\s\S]*?\n    \);/;
    if (!sortAndReturnPattern.test(existing)) {
      return false;
    }

    const patched = existing.replace(sortAndReturnPattern, replacement);
    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function patchWorkflowModelInputIfPresent(path) {
  try {
    const existing = await readFile(path, "utf-8");
    const modelInputPattern = /^\s*model:\s*".*"\s*\r?\n/m;
    if (!modelInputPattern.test(existing)) {
      return false;
    }
    const patched = existing.replace(modelInputPattern, "");
    if (patched === existing) {
      return false;
    }
    await writeFile(path, patched, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate anteater.config.ts
 */
export function generateConfig({ repo, allowedGlobs, blockedGlobs, autoMerge, isTypeScript, productionBranch }) {
  const ext = isTypeScript ? "ts" : "js";
  const typeImport = isTypeScript
    ? `import type { AnteaterConfig } from "next-anteater";\n\n`
    : "";
  const typeAnnotation = isTypeScript ? ": AnteaterConfig" : "";

  return {
    filename: `anteater.config.${ext}`,
    content: `/**
 * SECURITY: Anteater lets users modify your app's code via AI.
 * Only expose the prompt bar to trusted users behind your own auth layer.
 * Users can make destructive changes and potentially access sensitive data.
 * Never use this in a production environment with real credentials.
 * See: https://github.com/scottgriffinm/anteater#security-warning
 */
${typeImport}const config${typeAnnotation} = {
  repo: "${repo}",
  productionBranch: "${productionBranch}",
  modes: ["prod", "copy"],
  autoMerge: ${autoMerge},

  allowedGlobs: [
${allowedGlobs.map((g) => `    "${g}",`).join("\n")}
  ],

  blockedGlobs: [
${blockedGlobs.map((g) => `    "${g}",`).join("\n")}
  ],

  requireReviewFor: ["auth", "billing", "payments", "dependencies"],
  maxFilesChanged: 20,
  maxDiffBytes: 120000,
};

export default config;
`,
  };
}

/**
 * Generate API route handler.
 *
 * Uses string concatenation instead of nested template literals to avoid
 * escape-sequence hell (template literals inside template literals).
 */
export function generateApiRoute({ isTypeScript, productionBranch }) {
  const ext = isTypeScript ? "ts" : "js";
  const TS = isTypeScript; // shorthand
  const lines = [];
  const add = (s) => lines.push(s);

  // --- Imports ---
  add('import { NextRequest, NextResponse } from "next/server";');
  if (TS) add('import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "next-anteater";');
  add("");

  // --- Helpers ---
  add("/** Auto-detect repo from Vercel system env vars, fall back to ANTEATER_GITHUB_REPO */");
  add("function getRepo()" + (TS ? ": string | undefined" : "") + " {");
  add("  if (process.env.ANTEATER_GITHUB_REPO) return process.env.ANTEATER_GITHUB_REPO;");
  add("  const owner = process.env.VERCEL_GIT_REPO_OWNER;");
  add("  const slug = process.env.VERCEL_GIT_REPO_SLUG;");
  add("  if (owner && slug) return `${owner}/${slug}`;");
  add("  return undefined;");
  add("}");
  add("");
  add("function ghFetch(url" + (TS ? ": string" : "") + ") {");
  add("  const token = process.env.GITHUB_TOKEN;");
  add("  return fetch(url, {");
  add("    headers: {");
  add("      Authorization: `Bearer ${token}`,");
  add('      Accept: "application/vnd.github+json",');
  add('      "X-GitHub-Api-Version": "2022-11-28",');
  add("    },");
  add('    cache: "no-store",');
  add("  });");
  add("}");
  add("");
  add("/** Return status response with deployment ID for client-side deploy detection */");
  add("function status(body" + (TS ? ": AnteaterStatusResponse" : "") + ", httpStatus" + (TS ? "?: number" : "") + ") {");
  add("  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;");
  add("  return NextResponse.json({ ...body, deploymentId }, httpStatus ? { status: httpStatus } : undefined);");
  add("}");
  add("");

  // --- POST handler ---
  add("export async function POST(request" + (TS ? ": NextRequest" : "") + ") {");
  add("  try {");
  add('    const contentType = request.headers.get("content-type") || "";');
  add('    if (!contentType.toLowerCase().includes("application/json")) {');
  add("      return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add('        { requestId: "", branch: "", status: "error", error: "Content-Type must be application/json" },');
  add("        { status: 415 }");
  add("      );");
  add("    }");
  add("");
  add("    const body" + (TS ? ": AnteaterRequest" : "") + " = await request.json();");
  add("");
  add("    if (!body.prompt?.trim()) {");
  add("      return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add('        { requestId: "", branch: "", status: "error", error: "Prompt is required" },');
  add("        { status: 400 }");
  add("      );");
  add("    }");
  add("");
  add("    // Same-origin guard for mutating Anteater requests (no app auth integration required)");
  add("    const requestOrigin = request.nextUrl.origin;");
  add('    const fetchSite = request.headers.get("sec-fetch-site");');
  add('    const origin = request.headers.get("origin");');
  add('    const referer = request.headers.get("referer");');
  add("    const hasMatchingOrigin = origin === requestOrigin;");
  add("    const hasMatchingReferer = (() => {");
  add("      if (!referer) return false;");
  add("      try {");
  add("        return new URL(referer).origin === requestOrigin;");
  add("      } catch {");
  add("        return false;");
  add("      }");
  add("    })();");
  add('    const hasSameOriginBrowserSignal = fetchSite === "same-origin";');
  add("    const hasValidSameOriginSignal = hasSameOriginBrowserSignal || hasMatchingOrigin || hasMatchingReferer;");
  add("    const secret = process.env.ANTEATER_SECRET;");
  add('    const hasValidSecret = !!secret && request.headers.get("x-anteater-secret") === secret;');
  add("    if (!hasValidSameOriginSignal && !hasValidSecret) {");
  add("      return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add('        { requestId: "", branch: "", status: "error", error: "Forbidden" },');
  add("        { status: 403 }");
  add("      );");
  add("    }");
  add("");
  add("    const repo = getRepo();");
  add("    const token = process.env.GITHUB_TOKEN;");
  add("    if (!repo || !token) {");
  add("      return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add('        { requestId: "", branch: "", status: "error", error: "Server misconfigured" },');
  add("        { status: 500 }");
  add("      );");
  add("    }");
  add("");
  add("    const requestId = crypto.randomUUID().slice(0, 8);");
  add("    const branch = body.mode === \"copy\"");
  add("      ? `anteater/friend-${requestId}`");
  add("      : `anteater/run-${requestId}`;");
  add("");
  add("    const dispatchRes = await fetch(");
  add("      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/dispatches`,");
  add("      {");
  add('        method: "POST",');
  add("        headers: {");
  add("          Authorization: `Bearer ${token}`,");
  add('          Accept: "application/vnd.github+json",');
  add('          "X-GitHub-Api-Version": "2022-11-28",');
  add("        },");
  add("        body: JSON.stringify({");
  add('          ref: "' + productionBranch + '",');
  add("          inputs: {");
  add("            requestId,");
  add("            prompt: body.prompt,");
  add('            mode: body.mode || "prod",');
  add("            branch,");
  add('            baseBranch: "' + productionBranch + '",');
  add('            autoMerge: String(body.mode !== "copy"),');
  add("          },");
  add("        }),");
  add("      }");
  add("    );");
  add("");
  add("    if (!dispatchRes.ok) {");
  add("      const err = await dispatchRes.text();");
  add("      return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add("        { requestId, branch, status: \"error\", error: `GitHub dispatch failed: ${dispatchRes.status}` },");
  add("        { status: 502 }");
  add("      );");
  add("    }");
  add("");
  add("    return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "({ requestId, branch, status: \"queued\" });");
  add("  } catch {");
  add("    return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add('      { requestId: "", branch: "", status: "error", error: "Invalid request body" },');
  add("      { status: 400 }");
  add("    );");
  add("  }");
  add("}");
  add("");

  // --- GET handler (status polling) ---
  add("/**");
  add(" * GET /api/anteater?branch=anteater/run-xxx");
  add(" * Polls pipeline status. Deploy detection handled client-side via deployment ID.");
  add(" */");
  add("export async function GET(request" + (TS ? ": NextRequest" : "") + ") {");
  add("  const branch = request.nextUrl.searchParams.get(\"branch\");");
  add("  if (!branch) {");
  add('    return status({ step: "error", completed: true, error: "Missing branch param" }, 400);');
  add("  }");
  add("");
  add("  const repo = getRepo();");
  add("  const token = process.env.GITHUB_TOKEN;");
  add("  if (!repo || !token) {");
  add('    return status({ step: "error", completed: true, error: "Server misconfigured" }, 500);');
  add("  }");
  add("");
  add("  try {");
  add("    const prRes = await ghFetch(");
  add("      `https://api.github.com/repos/${repo}/pulls?head=${repo.split(\"/\")[0]}:${branch}&state=all&per_page=1`,");
  add("    );");
  add("    if (prRes.ok) {");
  add("      const prs = await prRes.json();");
  add("      if (prs.length) {");
  add("        const pr = prs[0];");
  add("        if (pr.merged_at) {");
  add("          return status({ step: \"deploying\", completed: false });");
  add("        }");
  add("        if (pr.state === \"closed\") {");
  add('          return status({ step: "error", completed: true, error: "PR was closed without merging" });');
  add("        }");
  add("        return status({ step: \"merging\", completed: false });");
  add("      }");
  add("    }");
  add("");
  add("    const branchRes = await ghFetch(");
  add("      `https://api.github.com/repos/${repo}/git/refs/heads/${branch}`,");
  add("    );");
  add("    if (branchRes.ok) {");
  add("      return status({ step: \"merging\", completed: false });");
  add("    }");
  add("");
  add("    const runsRes = await ghFetch(");
  add("      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?per_page=5`,");
  add("    );");
  add("    if (runsRes.ok) {");
  add("      const { workflow_runs: runs } = await runsRes.json();");
  add("      const recentFailed = runs?.find(");
  add('        (r' + (TS ? ": { status: string; conclusion: string; created_at: string }" : "") + ') => r.status === "completed" && r.conclusion === "failure" &&');
  add("          Date.now() - new Date(r.created_at).getTime() < 5 * 60 * 1000,");
  add("      );");
  add("      if (recentFailed) {");
  add('        return status({ step: "error", completed: true, error: "Workflow failed — check GitHub Actions" });');
  add("      }");
  add("    }");
  add("");
  add("    return status({ step: \"working\", completed: false });");
  add("  } catch {");
  add('    return status({ step: "error", completed: true, error: "Status check failed" }, 500);');
  add("  }");
  add("}");

  return {
    filename: `route.${ext}`,
    content: lines.join("\n") + "\n",
  };
}

/**
 * Generate .claude/settings.local.json for agent permissions.
 */
export function generateClaudeSettings({ model, permissionsMode }) {
  if (permissionsMode === "unrestricted") {
    return JSON.stringify({
      model,
      alwaysThinkingEnabled: true,
      skipDangerousModePermissionPrompt: true,
      permissions: {
        defaultMode: "bypassPermissions",
        allow: [
          "Bash", "Edit", "Write", "MultiEdit", "NotebookEdit",
          "WebFetch", "WebSearch", "Skill", "mcp__*",
        ],
        deny: [],
      },
    }, null, 2) + "\n";
  }

  // Sandboxed (default)
  return JSON.stringify({
    model,
    alwaysThinkingEnabled: true,
    skipDangerousModePermissionPrompt: true,
    permissions: {
      defaultMode: "bypassPermissions",
      allow: [
        "Read", "Edit", "Write", "Glob", "Grep",
        "Bash(git *)", "Bash(npm *)", "Bash(pnpm *)",
        "Bash(npx *)", "Bash(node *)", "Bash(ls *)",
        "Bash(find *)", "Bash(mkdir *)", "Bash(rm *)",
        "Bash(cp *)", "Bash(mv *)",
      ],
      deny: [
        "WebFetch", "WebSearch",
        "Bash(curl *)", "Bash(wget *)",
        "Bash(gh *)", "Bash(vercel *)",
        "mcp__*",
      ],
    },
  }, null, 2) + "\n";
}

/**
 * Generate the GitHub Actions workflow.
 */
export function generateWorkflow({ allowedGlobs, blockedGlobs, productionBranch, model, packageManager = "npm" }) {
  const allowed = allowedGlobs.join(", ");
  const blocked = blockedGlobs.join(", ");

  return `name: Anteater Apply
run-name: "anteater [\${{ inputs.requestId }}] [\${{ inputs.mode }}] \${{ inputs.prompt }}"

on:
  workflow_dispatch:
    inputs:
      requestId:
        description: "Unique request ID"
        required: true
      prompt:
        description: "Natural language change request"
        required: true
      mode:
        description: "prod or copy"
        required: true
        default: "prod"
      branch:
        description: "Branch to create and commit to"
        required: true
      baseBranch:
        description: "Base branch to fork from"
        required: true
        default: "${productionBranch}"
      autoMerge:
        description: "Auto-merge the PR if true"
        required: false
        default: "true"

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  apply:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - name: Checkout base branch
        uses: actions/checkout@v4
        with:
          ref: \${{ inputs.baseBranch }}
          fetch-depth: 0

      - name: Create and switch to target branch
        run: git checkout -b "\${{ inputs.branch }}"

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: ${packageManager === "pnpm" ? "npm install -g pnpm@9 --silent && pnpm install --frozen-lockfile" : packageManager === "yarn" ? "yarn install --frozen-lockfile" : "npm ci"}

      - name: Run Anteater agent
        uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            You are Anteater, an AI agent that modifies a web app based on user requests.

            USER REQUEST: \${{ inputs.prompt }}

            RULES:
            - Only edit files under: ${allowed}
            - NEVER edit: ${blocked}
            - Make minimal, focused changes
            - Preserve existing code style
            - After making changes, run the build command to verify the build passes
            - If the build fails, read the error output and fix the issues, then build again
            - Keep iterating until the build passes or you've tried 3 times
            - Do NOT commit — just leave the changed files on disk

            IMPORTANT: Always verify your changes compile by running the build command.
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: "--allowedTools Edit,Read,Write,Bash,Glob,Grep --max-turns 25"

      - name: Check for changes
        id: changes
        run: |
          git add -A
          if git diff --staged --quiet; then
            echo "has_changes=false" >> "\$GITHUB_OUTPUT"
          else
            echo "has_changes=true" >> "\$GITHUB_OUTPUT"
          fi

      - name: Commit changes
        if: steps.changes.outputs.has_changes == 'true'
        env:
          PROMPT: \${{ inputs.prompt }}
        run: |
          git config user.name "anteater[bot]"
          git config user.email "anteater[bot]@users.noreply.github.com"
          git commit -m "anteater: \${PROMPT}"

      - name: Push branch
        if: steps.changes.outputs.has_changes == 'true'
        run: |
          git remote set-url origin "https://x-access-token:\${GITHUB_TOKEN}@github.com/\${{ github.repository }}.git"
          git push origin "\${{ inputs.branch }}"
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Create pull request
        if: steps.changes.outputs.has_changes == 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PROMPT: \${{ inputs.prompt }}
          REQUEST_ID: \${{ inputs.requestId }}
          MODE: \${{ inputs.mode }}
        run: |
          gh pr create \\
            --base "\${{ inputs.baseBranch }}" \\
            --head "\${{ inputs.branch }}" \\
            --title "anteater: \${PROMPT}" \\
            --body "Automated change by Anteater (request \\\`\${REQUEST_ID}\\\`).

          **Prompt:** \${PROMPT}
          **Mode:** \${MODE}"

      - name: Auto-merge PR
        if: steps.changes.outputs.has_changes == 'true' && inputs.autoMerge == 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh pr merge "\${{ inputs.branch }}" --squash --delete-branch
`;
}

/**
 * Generate the /api/anteater/runs route handler for multi-run discovery.
 *
 * Uses workflow runs as the primary data source (via run-name containing
 * requestId, mode, and prompt). Fetches job steps only for in-progress runs
 * (to distinguish initializing vs working) and failed runs (to get the
 * failing step name). Merges with PR data for post-merge states.
 */
export function generateRunsRoute({ isTypeScript }) {
  const ext = isTypeScript ? "ts" : "js";
  const TS = isTypeScript;
  const lines = [];
  const add = (s) => lines.push(s);

  add('import { NextResponse } from "next/server";');
  if (TS) add('import type { AnteaterRun, AnteaterRunsResponse } from "next-anteater";');
  add("");

  // --- Helpers ---
  add("function getRepo()" + (TS ? ": string | undefined" : "") + " {");
  add("  if (process.env.ANTEATER_GITHUB_REPO) return process.env.ANTEATER_GITHUB_REPO;");
  add("  const owner = process.env.VERCEL_GIT_REPO_OWNER;");
  add("  const slug = process.env.VERCEL_GIT_REPO_SLUG;");
  add("  if (owner && slug) return `${owner}/${slug}`;");
  add("  return undefined;");
  add("}");
  add("");
  add("function emptyResponse() {");
  add("  return NextResponse.json" + (TS ? "<AnteaterRunsResponse>" : "") + "({ runs: [], deploymentId: process.env.VERCEL_DEPLOYMENT_ID });");
  add("}");
  add("");
  add("/** Parse run-name format: \"anteater [requestId] [mode] prompt text\" */");
  add("function parseRunName(title" + (TS ? ": string" : "") + ")" + (TS ? ": { requestId: string; mode: \"prod\" | \"copy\"; prompt: string } | null" : "") + " {");
  add("  const m = title.match(/^anteater \\[([^\\]]+)\\] \\[([^\\]]+)\\] (.+)$/);");
  add("  if (!m) return null;");
  add("  return { requestId: m[1], mode: m[2] === \"copy\" ? \"copy\" : \"prod\"" + (TS ? " as const" : "") + ", prompt: m[3] };");
  add("}");
  add("");

  // --- GET handler ---
  add("export async function GET() {");
  add("  const repo = getRepo();");
  add("  const token = process.env.GITHUB_TOKEN;");
  add("  if (!repo || !token) return emptyResponse();");
  add("");
  add("  const gh = (url" + (TS ? ": string" : "") + ") =>");
  add("    fetch(url, {");
  add("      headers: {");
  add("        Authorization: `Bearer ${token}`,");
  add('        Accept: "application/vnd.github+json",');
  add('        "X-GitHub-Api-Version": "2022-11-28",');
  add("      },");
  add('      cache: "no-store",');
  add("    });");
  add("");
  add("  try {");
  add("    // Fetch workflow runs and PRs in parallel");
  add("    const [wfRes, prsRes] = await Promise.all([");
  add("      gh(`https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?per_page=10`),");
  add("      gh(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=20&sort=created&direction=desc`),");
  add("    ]);");
  add("");
  add("    const wfData = wfRes.ok ? await wfRes.json() : { workflow_runs: [] };");
  add("    const allPrs" + (TS ? ": any[]" : "") + " = prsRes.ok ? await prsRes.json() : [];");
  add("");
  add("    // Filter workflow runs that have our run-name format");
  add("    const wfRuns = (wfData.workflow_runs || []).filter(");
  add("      (r" + (TS ? ": any" : "") + ") => r.display_title?.startsWith(\"anteater [\")");
  add("    );");
  add("");
  add("    // Index PRs by requestId (last segment of branch name)");
  add("    const anteaterPrs = allPrs.filter((pr" + (TS ? ": any" : "") + ") => pr.head.ref.startsWith(\"anteater/\"));");
  add("    const prByReqId = new Map" + (TS ? "<string, any>" : "") + "();");
  add("    for (const pr of anteaterPrs) {");
  add("      const parts = pr.head.ref.split(\"-\");");
  add("      const reqId = parts[parts.length - 1];");
  add("      if (reqId) prByReqId.set(reqId, pr);");
  add("    }");
  add("");
  add("    // First pass: classify each workflow run, collect jobs-needed list");
  add("    const runs" + (TS ? ": AnteaterRun[]" : "") + " = [];");
  add("    const needJobs" + (TS ? ": Array<{ wfRun: any; runData: Omit<AnteaterRun, \"step\"> }>" : "") + " = [];");
  add("");
  add("    for (const wfRun of wfRuns) {");
  add("      const parsed = parseRunName(wfRun.display_title);");
  add("      if (!parsed) continue;");
  add("");
  add("      const { requestId, mode, prompt } = parsed;");
  add("      const branch = mode === \"copy\"");
  add("        ? `anteater/friend-${requestId}`");
  add("        : `anteater/run-${requestId}`;");
  add("      const startedAt = wfRun.created_at;");
  add("      const pr = prByReqId.get(requestId);");
  add("      const base = { branch, requestId, prompt, mode, startedAt };");
  add("");
  add("      // Check PR state first (takes precedence for later stages)");
  add("      if (pr?.merged_at) {");
  add("        const mergedAgo = Date.now() - new Date(pr.merged_at).getTime();");
  add("        if (mergedAgo > 300000) continue; // >5 min ago, done");
  add("        runs.push({ ...base, step: \"deploying\" });");
  add("        continue;");
  add("      }");
  add("      if (pr?.state === \"closed\") continue; // closed without merge");
  add("      if (pr?.state === \"open\") {");
  add("        runs.push({ ...base, step: \"merging\" });");
  add("        continue;");
  add("      }");
  add("");
  add("      // No PR — determine step from workflow run status");
  add("      if (wfRun.status === \"completed\") {");
  add("        if (wfRun.conclusion === \"failure\") {");
  add("          // Need jobs to find which step failed");
  add("          needJobs.push({ wfRun, runData: base });");
  add("        }");
  add("        // success without PR shouldn't happen (no changes?), skip");
  add("        continue;");
  add("      }");
  add("");
  add("      if (wfRun.status === \"queued\") {");
  add("        runs.push({ ...base, step: \"initializing\" });");
  add("        continue;");
  add("      }");
  add("");
  add("      if (wfRun.status === \"in_progress\") {");
  add("        // Need jobs to check if agent step has started");
  add("        needJobs.push({ wfRun, runData: base });");
  add("        continue;");
  add("      }");
  add("    }");
  add("");
  add("    // Second pass: fetch jobs in parallel for runs that need step detail");
  add("    if (needJobs.length > 0) {");
  add("      const jobResults = await Promise.all(");
  add("        needJobs.map(async ({ wfRun, runData }) => {");
  add("          try {");
  add("            const res = await gh(wfRun.jobs_url);");
  add("            if (!res.ok) return { wfRun, runData, steps: [] };");
  add("            const data = await res.json();");
  add("            return { wfRun, runData, steps: data.jobs?.[0]?.steps || [] };");
  add("          } catch {");
  add("            return { wfRun, runData, steps: [] };");
  add("          }");
  add("        })");
  add("      );");
  add("");
  add("      for (const { wfRun, runData, steps } of jobResults) {");
  add("        if (wfRun.conclusion === \"failure\") {");
  add("          const failed = steps.find((s" + (TS ? ": any" : "") + ") => s.conclusion === \"failure\");");
  add("          runs.push({ ...runData, step: \"error\", failedStep: failed?.name || \"Unknown\" });");
  add("        } else {");
  add("          // in_progress — check if agent step has started");
  add("          const agentStep = steps.find((s" + (TS ? ": any" : "") + ") => s.name === \"Run Anteater agent\");");
  add("          const isWorking = agentStep?.status === \"in_progress\" || agentStep?.conclusion === \"success\";");
  add("          runs.push({ ...runData, step: isWorking ? \"working\" : \"initializing\" });");
  add("        }");
  add("      }");
  add("    }");
  add("");
  add("    // Sort newest first, cap at 5");
  add("    // Drop stale failed runs (>1h) so old errors don't clutter the bar");
  add("    const failedCutoffMs = 60 * 60 * 1000;");
  add("    const freshRuns = runs.filter((r) => {");
  add("      if (r.step !== \"error\") return true;");
  add("      const startedAtMs = new Date(r.startedAt).getTime();");
  add("      if (Number.isNaN(startedAtMs)) return true;");
  add("      return Date.now() - startedAtMs <= failedCutoffMs;");
  add("    });");
  add("");
  add("    freshRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());");
  add("");
  add("    return NextResponse.json" + (TS ? "<AnteaterRunsResponse>" : "") + "(");
  add("      { runs: freshRuns.slice(0, 5), deploymentId: process.env.VERCEL_DEPLOYMENT_ID }");
  add("    );");
  add("  } catch {");
  add("    return emptyResponse();");
  add("  }");
  add("}");
  add("");

  for (const line of buildRunsDeleteHandlerLines(TS)) add(line);

  return {
    filename: `route.${ext}`,
    content: lines.join("\n") + "\n",
  };
}

function buildRunsDeleteHandlerLines(TS) {
  const lines = [];
  const add = (s) => lines.push(s);

  add("");
  add("// --- DELETE handler: delete a failed workflow run by requestId ---");
  add("export async function DELETE(request" + (TS ? ": Request" : "") + ") {");
  add("  const repo = getRepo();");
  add("  const token = process.env.GITHUB_TOKEN;");
  add("  if (!repo || !token) {");
  add("    return NextResponse.json({ error: \"Server misconfigured\" }, { status: 500 });");
  add("  }");
  add("");
  add("  const { searchParams } = new URL(request.url);");
  add("  const requestId = searchParams.get(\"requestId\");");
  add("  if (!requestId) {");
  add("    return NextResponse.json({ error: \"requestId is required\" }, { status: 400 });");
  add("  }");
  add("");
  add("  // Same-origin guard for mutating runs endpoint (no app auth integration required)");
  add("  const requestOrigin = new URL(request.url).origin;");
  add('  const fetchSite = request.headers.get("sec-fetch-site");');
  add('  const origin = request.headers.get("origin");');
  add('  const referer = request.headers.get("referer");');
  add("  const hasMatchingOrigin = origin === requestOrigin;");
  add("  const hasMatchingReferer = (() => {");
  add("    if (!referer) return false;");
  add("    try {");
  add("      return new URL(referer).origin === requestOrigin;");
  add("    } catch {");
  add("      return false;");
  add("    }");
  add("  })();");
  add('  const hasSameOriginBrowserSignal = fetchSite === "same-origin";');
  add("  const hasValidSameOriginSignal = hasSameOriginBrowserSignal || hasMatchingOrigin || hasMatchingReferer;");
  add("  const secret = process.env.ANTEATER_SECRET;");
  add('  const hasValidSecret = !!secret && request.headers.get("x-anteater-secret") === secret;');
  add("  if (!hasValidSameOriginSignal && !hasValidSecret) {");
  add('    return NextResponse.json({ error: "Forbidden" }, { status: 403 });');
  add("  }");
  add("");
  add("  const gh = (url" + (TS ? ": string" : "") + ", options" + (TS ? "?: RequestInit" : "") + ") =>");
  add("    fetch(url, {");
  add("      ...options,");
  add("      headers: {");
  add("        Authorization: `Bearer ${token}`,");
  add('        Accept: "application/vnd.github+json",');
  add('        "X-GitHub-Api-Version": "2022-11-28",');
  add("        ...options?.headers,");
  add("      },");
  add("    });");
  add("");
  add("  try {");
  add("    // Find the workflow run matching this requestId");
  add("    const res = await gh(");
  add("      `https://api.github.com/repos/${repo}/actions/workflows/anteater.yml/runs?per_page=100`");
  add("    );");
  add("    if (!res.ok) {");
  add("      return NextResponse.json({ error: \"Failed to fetch workflow runs\" }, { status: 502 });");
  add("    }");
  add("");
  add("    const data = await res.json();");
  add("    const wfRun = (data.workflow_runs || []).find(");
  add("      (r" + (TS ? ": any" : "") + ") => r.display_title?.includes(`[${requestId}]`)");
  add("    );");
  add("");
  add("    if (!wfRun) {");
  add("      return NextResponse.json({ error: \"Workflow run not found\" }, { status: 404 });");
  add("    }");
  add("");
  add("    // Only failed runs are deletable from this endpoint");
  add("    if (!(wfRun.status === \"completed\" && wfRun.conclusion === \"failure\")) {");
  add("      return NextResponse.json({ error: \"Only failed runs can be deleted\" }, { status: 409 });");
  add("    }");
  add("");
  add("    // Delete the workflow run");
  add("    const delRes = await gh(");
  add("      `https://api.github.com/repos/${repo}/actions/runs/${wfRun.id}`,");
  add("      { method: \"DELETE\" }");
  add("    );");
  add("");
  add("    if (!delRes.ok && delRes.status !== 204) {");
  add("      return NextResponse.json({ error: \"Failed to delete workflow run\" }, { status: 502 });");
  add("    }");
  add("");
  add("    return NextResponse.json({ deleted: true });");
  add("  } catch {");
  add("    return NextResponse.json({ error: \"Delete failed\" }, { status: 500 });");
  add("  }");
  add("}");

  return lines;
}

function buildRunsDeleteHandler(isTypeScript) {
  return buildRunsDeleteHandlerLines(isTypeScript).join("\n");
}

/**
 * Generate the AI apply script.
 */
export function generateApplyScript() {
  // Read from the existing script in the monorepo — or inline it
  return `#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { glob } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const { values: args } = parseArgs({
  options: {
    prompt: { type: "string" },
    "allowed-paths": { type: "string" },
    "blocked-paths": { type: "string", default: "" },
  },
});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }
if (!args.prompt) { console.error("Missing --prompt"); process.exit(1); }

const allowedGlobs = args["allowed-paths"]?.split(",").map((s) => s.trim()) ?? [];
const blockedGlobs = args["blocked-paths"]?.split(",").filter(Boolean).map((s) => s.trim()) ?? [];

async function collectFiles() {
  const files = new Set();
  for (const pattern of allowedGlobs) {
    for await (const entry of glob(pattern)) {
      const rel = relative(process.cwd(), resolve(entry)).replace(/\\\\/g, "/");
      let blocked = false;
      for (const bp of blockedGlobs) {
        const prefix = bp.replace(/\\/?\\*\\*?$/, "");
        if (rel === prefix || rel.startsWith(prefix + "/")) { blocked = true; break; }
      }
      if (!blocked && !rel.includes("node_modules")) files.add(rel);
    }
  }
  return [...files].sort();
}

async function readFiles(paths) {
  const result = {};
  for (const p of paths) {
    try { result[p] = await readFile(p, "utf-8"); } catch {}
  }
  return result;
}

async function callClaude(prompt, fileContents) {
  const fileList = Object.entries(fileContents)
    .map(([path, content]) => \`--- \${path} ---\\n\${content}\`).join("\\n\\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      system: \`You are Anteater, an AI coding agent. You modify web application source files based on user requests.
RULES: Make minimal, focused changes. Only modify files that need to change. Preserve existing code style.
Never modify environment files, API routes, or configuration.
CRITICAL: The "path" in each output object MUST exactly match one of the input file paths. Do NOT shorten, rename, or strip prefixes from paths.
OUTPUT FORMAT: Return a JSON array of objects with "path" and "content". Return ONLY valid JSON, no markdown fences.
If no changes are needed, return an empty array: []\`,
      messages: [{ role: "user", content: \`Files:\\n\\n\${fileList}\\n\\nRequest: \${prompt}\` }],
    }),
  });

  if (!res.ok) throw new Error(\`Anthropic API error \${res.status}: \${await res.text()}\`);
  const data = await res.json();
  if (data.stop_reason === "max_tokens") throw new Error("Response truncated — max_tokens exceeded");
  return JSON.parse(data.content?.[0]?.text || "[]");
}

export async function main() {
  console.log(\`Anteater agent: "\${args.prompt}"\`);
  const paths = await collectFiles();
  console.log(\`Found \${paths.length} editable files\`);
  if (!paths.length) { console.log("No files matched."); process.exit(0); }

  const contents = await readFiles(paths);
  console.log("Calling Claude...");
  const changes = await callClaude(args.prompt, contents);

  if (!changes?.length) { console.log("No changes needed."); process.exit(0); }

  // Validate returned paths match input files
  const validPathSet = new Set(Object.keys(contents));
  const validated = [];
  for (const change of changes) {
    if (validPathSet.has(change.path)) {
      validated.push(change);
    } else {
      console.warn(\`  Rejected: \${change.path} (not in allowed input files)\`);
      const basename = change.path.split("/").pop();
      const match = [...validPathSet].find((p) => p.endsWith("/" + basename));
      if (match) {
        console.log(\`  Corrected: \${change.path} -> \${match}\`);
        validated.push({ path: match, content: change.content });
      }
    }
  }

  if (!validated.length) { console.log("No valid changes after path validation."); process.exit(0); }
  console.log(\`Modifying \${validated.length} file(s)\`);
  for (const { path, content } of validated) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
    console.log(\`  Updated: \${path}\`);
  }
  console.log("Done!");
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((err) => { console.error("Agent failed:", err); process.exit(1); });
}
`;
}

/**
 * Patch the layout file to include AnteaterBar.
 */
export async function patchLayout(layoutPath, cwd) {
  const fullPath = join(cwd, layoutPath);
  let content = await readFile(fullPath, "utf-8");

  // Don't patch if already has AnteaterBar
  if (content.includes("AnteaterBar")) {
    return false;
  }

  // Add import at the top (after last import line)
  const importLine = `import { AnteaterBar } from "next-anteater";\n`;
  const lastImportIdx = content.lastIndexOf("import ");
  if (lastImportIdx !== -1) {
    const endOfLine = content.indexOf("\n", lastImportIdx);
    content = content.slice(0, endOfLine + 1) + importLine + content.slice(endOfLine + 1);
  }

  // Add <AnteaterBar /> before closing </body>
  content = content.replace(
    /([ \t]*)<\/body>/,
    `$1  <AnteaterBar />\n$1</body>`
  );

  await writeFile(fullPath, content, "utf-8");
  return true;
}

/**
 * Write all scaffolded files.
 */
export async function scaffoldFiles(cwd, options) {
  const results = [];

  // anteater.config
  const config = generateConfig(options);
  if (await writeIfNotExists(join(cwd, config.filename), config.content)) {
    results.push(config.filename);
  }

  // API route
  const route = generateApiRoute(options);
  const routeDir = options.isAppRouter ? "app/api/anteater" : "pages/api/anteater";
  const routePath = join(cwd, routeDir, route.filename);
  const createdRoute = await writeIfNotExists(routePath, route.content);
  if (createdRoute) {
    results.push(join(routeDir, route.filename));
  } else if (await patchApiRouteMutationGuardIfMissing(routePath)) {
    results.push(`${join(routeDir, route.filename)} (patched same-origin guard)`);
  }

  // Runs API route (multi-run discovery)
  const runsRoute = generateRunsRoute(options);
  const runsDir = options.isAppRouter ? "app/api/anteater/runs" : "pages/api/anteater/runs";
  const runsPath = join(cwd, runsDir, runsRoute.filename);
  const createdRunsRoute = await writeIfNotExists(runsPath, runsRoute.content);
  if (createdRunsRoute) {
    results.push(join(runsDir, runsRoute.filename));
  } else {
    if (await patchRunsRouteDeleteIfMissing(runsPath, options.isTypeScript)) {
      results.push(`${join(runsDir, runsRoute.filename)} (patched DELETE handler)`);
    }
    if (await patchRunsRouteMutationGuardIfMissing(runsPath)) {
      results.push(`${join(runsDir, runsRoute.filename)} (patched same-origin guard)`);
    }
    if (await patchRunsRouteFailedTtlIfMissing(runsPath)) {
      results.push(`${join(runsDir, runsRoute.filename)} (patched failed-run TTL)`);
    }
  }

  // GitHub Action workflow
  const workflowPath = join(cwd, ".github/workflows/anteater.yml");
  if (await writeIfNotExists(workflowPath, generateWorkflow(options))) {
    results.push(".github/workflows/anteater.yml");
  } else if (await patchWorkflowModelInputIfPresent(workflowPath)) {
    results.push(".github/workflows/anteater.yml (patched deprecated model input)");
  }

  // Claude Code agent settings (always overwrite — reflects current choices)
  if (options.model && options.permissionsMode) {
    const settingsPath = join(cwd, ".claude/settings.local.json");
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, generateClaudeSettings(options), "utf-8");
    results.push(".claude/settings.local.json");
  }

  // Patch layout
  if (options.layoutFile) {
    if (await patchLayout(options.layoutFile, cwd)) {
      results.push(`${options.layoutFile} (patched)`);
    }
  }

  return results;
}
