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

/**
 * Generate anteater.config.ts
 */
export function generateConfig({ repo, allowedGlobs, blockedGlobs, autoMerge, isTypeScript, productionBranch }) {
  const ext = isTypeScript ? "ts" : "js";
  const typeImport = isTypeScript
    ? `import type { AnteaterConfig } from "@anteater/next";\n\n`
    : "";
  const typeAnnotation = isTypeScript ? ": AnteaterConfig" : "";

  return {
    filename: `anteater.config.${ext}`,
    content: `${typeImport}const config${typeAnnotation} = {
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
  if (TS) add('import type { AnteaterRequest, AnteaterResponse, AnteaterStatusResponse } from "@anteater/next";');
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
  add("    const body" + (TS ? ": AnteaterRequest" : "") + " = await request.json();");
  add("");
  add("    if (!body.prompt?.trim()) {");
  add("      return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add('        { requestId: "", branch: "", status: "error", error: "Prompt is required" },');
  add("        { status: 400 }");
  add("      );");
  add("    }");
  add("");
  add("    // Auth: sec-fetch-site for same-origin (AnteaterBar), x-anteater-secret for external");
  add("    const secret = process.env.ANTEATER_SECRET;");
  add("    if (secret) {");
  add('      const fetchSite = request.headers.get("sec-fetch-site");');
  add('      const isSameOrigin = fetchSite === "same-origin";');
  add("      if (!isSameOrigin) {");
  add('        const authHeader = request.headers.get("x-anteater-secret");');
  add("        if (authHeader !== secret) {");
  add("          return NextResponse.json" + (TS ? "<AnteaterResponse>" : "") + "(");
  add('            { requestId: "", branch: "", status: "error", error: "Unauthorized" },');
  add("            { status: 401 }");
  add("          );");
  add("        }");
  add("      }");
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
  add("          const mergedAgo = Date.now() - new Date(pr.merged_at).getTime();");
  add("          const step = mergedAgo > 150000 ? \"done\" : \"redeploying\";");
  add("          return status({ step, completed: step === \"done\" });");
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
export function generateWorkflow({ allowedGlobs, blockedGlobs, productionBranch, model }) {
  const allowed = allowedGlobs.join(", ");
  const blocked = blockedGlobs.join(", ");

  return `name: Anteater Apply

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
        run: |
          npm install -g pnpm@9 --silent
          pnpm install --frozen-lockfile

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
          model: "${model}"
          claude_args: "--allowedTools Edit,Read,Write,Bash,Glob,Grep --max-turns 25"

      - name: Check for changes
        id: changes
        run: |
          git add -A
          if git diff --staged --quiet; then
            echo "has_changes=false" >> "\\$GITHUB_OUTPUT"
          else
            echo "has_changes=true" >> "\\$GITHUB_OUTPUT"
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
 * Generate the AI apply script.
 */
export function generateApplyScript() {
  // Read from the existing script in the monorepo — or inline it
  return `#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { glob } from "node:fs/promises";
import { parseArgs } from "node:util";

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

async function main() {
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
        console.log(\`  Corrected: \${change.path} → \${match}\`);
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

main().catch((err) => { console.error("Agent failed:", err); process.exit(1); });
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
  const importLine = `import { AnteaterBar } from "@anteater/next";\n`;
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
  if (await writeIfNotExists(routePath, route.content)) {
    results.push(join(routeDir, route.filename));
  }

  // GitHub Action workflow
  const workflowPath = join(cwd, ".github/workflows/anteater.yml");
  if (await writeIfNotExists(workflowPath, generateWorkflow(options))) {
    results.push(".github/workflows/anteater.yml");
  }

  // Claude Code agent settings
  if (options.model && options.permissionsMode) {
    const settingsPath = join(cwd, ".claude/settings.local.json");
    if (await writeIfNotExists(settingsPath, generateClaudeSettings(options))) {
      results.push(".claude/settings.local.json");
    }
  }

  // Patch layout
  if (options.layoutFile) {
    if (await patchLayout(options.layoutFile, cwd)) {
      results.push(`${options.layoutFile} (patched)`);
    }
  }

  return results;
}
