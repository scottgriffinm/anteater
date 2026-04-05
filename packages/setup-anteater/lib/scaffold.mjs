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
 */
export function generateApiRoute({ isTypeScript, productionBranch }) {
  const ext = isTypeScript ? "ts" : "js";
  const typeImports = isTypeScript
    ? `import type { AnteaterRequest, AnteaterResponse } from "@anteater/next";\n`
    : "";
  const reqType = isTypeScript ? ": AnteaterRequest" : "";
  const resGeneric = isTypeScript ? "<AnteaterResponse>" : "";

  return {
    filename: `route.${ext}`,
    content: `import { NextRequest, NextResponse } from "next/server";
${typeImports}
export async function POST(request${isTypeScript ? ": NextRequest" : ""}) {
  try {
    const body${reqType} = await request.json();

    if (!body.prompt?.trim()) {
      return NextResponse.json${resGeneric}(
        { requestId: "", branch: "", status: "error", error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Auth check
    const secret = process.env.ANTEATER_SECRET;
    if (secret) {
      const authHeader = request.headers.get("x-anteater-secret");
      if (authHeader !== secret) {
        return NextResponse.json${resGeneric}(
          { requestId: "", branch: "", status: "error", error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const repo = process.env.ANTEATER_GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;

    if (!repo || !token) {
      return NextResponse.json${resGeneric}(
        { requestId: "", branch: "", status: "error", error: "Server misconfigured" },
        { status: 500 }
      );
    }

    const requestId = crypto.randomUUID().slice(0, 8);
    const branch =
      body.mode === "copy"
        ? \`anteater/friend-\${requestId}\`
        : \`anteater/run-\${requestId}\`;

    const dispatchRes = await fetch(
      \`https://api.github.com/repos/\${repo}/actions/workflows/anteater.yml/dispatches\`,
      {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${token}\`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: "${productionBranch}",
          inputs: {
            requestId,
            prompt: body.prompt,
            mode: body.mode || "prod",
            branch,
            baseBranch: "${productionBranch}",
            autoMerge: String(body.mode !== "copy"),
          },
        }),
      }
    );

    if (!dispatchRes.ok) {
      const err = await dispatchRes.text();
      return NextResponse.json${resGeneric}(
        { requestId, branch, status: "error", error: \`GitHub dispatch failed: \${dispatchRes.status}\` },
        { status: 502 }
      );
    }

    return NextResponse.json${resGeneric}({ requestId, branch, status: "queued" });
  } catch {
    return NextResponse.json${resGeneric}(
      { requestId: "", branch: "", status: "error", error: "Invalid request body" },
      { status: 400 }
    );
  }
}
`,
  };
}

/**
 * Generate the GitHub Actions workflow.
 */
export function generateWorkflow({ allowedGlobs, blockedGlobs, productionBranch }) {
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

jobs:
  apply:
    runs-on: ubuntu-latest
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

      - name: Run Anteater agent
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          node .github/scripts/apply-changes.mjs \\
            --prompt "\${{ inputs.prompt }}" \\
            --allowed-paths "${allowedGlobs.join(",")}" \\
            --blocked-paths "${blockedGlobs.join(",")}"

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
        run: |
          git config user.name "anteater[bot]"
          git config user.email "anteater[bot]@users.noreply.github.com"
          git commit -m "anteater: \${{ inputs.prompt }}"

      - name: Push branch
        if: steps.changes.outputs.has_changes == 'true'
        run: git push origin "\${{ inputs.branch }}"

      - name: Create pull request
        if: steps.changes.outputs.has_changes == 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr create \\
            --base "\${{ inputs.baseBranch }}" \\
            --head "\${{ inputs.branch }}" \\
            --title "anteater: \${{ inputs.prompt }}" \\
            --body "Automated change by Anteater (request \\\`\${{ inputs.requestId }}\\\`).

          **Prompt:** \${{ inputs.prompt }}
          **Mode:** \${{ inputs.mode }}"

      - name: Auto-merge PR
        if: steps.changes.outputs.has_changes == 'true' && inputs.autoMerge == 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh pr merge "\${{ inputs.branch }}" --squash --auto
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
        const prefix = bp.replace(/\\*\\*/g, "").replace(/\\*/g, "").replace(/\\/$/, "");
        if (rel.startsWith(prefix)) { blocked = true; break; }
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
      max_tokens: 8192,
      system: \`You are Anteater, an AI coding agent. You modify web application source files based on user requests.
RULES: Make minimal, focused changes. Only modify files that need to change. Preserve existing code style.
Never modify environment files, API routes, or configuration.
OUTPUT FORMAT: Return a JSON array of objects with "path" and "content". Return ONLY valid JSON, no markdown fences.
If no changes are needed, return an empty array: []\`,
      messages: [{ role: "user", content: \`Files:\\n\\n\${fileList}\\n\\nRequest: \${prompt}\` }],
    }),
  });

  if (!res.ok) throw new Error(\`Anthropic API error \${res.status}: \${await res.text()}\`);
  const data = await res.json();
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
  console.log(\`Modifying \${changes.length} file(s)\`);
  for (const { path, content } of changes) {
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

  // AI apply script
  const scriptPath = join(cwd, ".github/scripts/apply-changes.mjs");
  if (await writeIfNotExists(scriptPath, generateApplyScript())) {
    results.push(".github/scripts/apply-changes.mjs");
  }

  // Patch layout
  if (options.layoutFile) {
    if (await patchLayout(options.layoutFile, cwd)) {
      results.push(`${options.layoutFile} (patched)`);
    }
  }

  return results;
}
