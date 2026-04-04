#!/usr/bin/env node

/**
 * Anteater AI Agent Script
 *
 * Reads allowed source files, sends them to the Anthropic API with the user's
 * prompt, and writes back the modified files.
 *
 * Usage:
 *   node apply-changes.mjs --prompt "..." --allowed-paths "glob1,glob2" --blocked-paths "glob3"
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 * Requires: Node.js 22+ (for built-in fetch and glob)
 */

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
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

if (!args.prompt) {
  console.error("Missing --prompt");
  process.exit(1);
}

const allowedGlobs = args["allowed-paths"]?.split(",").map((s) => s.trim()) ?? [];
const blockedGlobs = args["blocked-paths"]?.split(",").filter(Boolean).map((s) => s.trim()) ?? [];

// Collect files matching allowed globs
async function collectFiles() {
  const files = new Set();
  for (const pattern of allowedGlobs) {
    for await (const entry of glob(pattern)) {
      const rel = relative(process.cwd(), resolve(entry));
      const normalized = rel.replace(/\\/g, "/");

      // Skip blocked paths
      let blocked = false;
      for (const bp of blockedGlobs) {
        // Simple prefix check for blocked globs
        const prefix = bp.replace(/\*\*/g, "").replace(/\*/g, "").replace(/\/$/, "");
        if (normalized.startsWith(prefix)) {
          blocked = true;
          break;
        }
      }

      if (!blocked && !normalized.includes("node_modules")) {
        files.add(normalized);
      }
    }
  }
  return [...files].sort();
}

// Read all file contents
async function readFiles(paths) {
  const result = {};
  for (const p of paths) {
    try {
      result[p] = await readFile(p, "utf-8");
    } catch {
      // Skip unreadable files
    }
  }
  return result;
}

// Call Anthropic API
async function callClaude(prompt, fileContents) {
  const fileList = Object.entries(fileContents)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join("\n\n");

  const systemPrompt = `You are Anteater, an AI coding agent. You modify web application source files based on user requests.

RULES:
- Make minimal, focused changes that fulfill the request
- Only modify files that need to change
- Preserve existing code style and patterns
- Never modify environment files, API routes, or configuration
- Return ONLY the files you changed, in the exact format specified

OUTPUT FORMAT:
Return a JSON array of objects, each with "path" (string) and "content" (string).
Return ONLY valid JSON, no markdown fences, no explanation.
Example: [{"path": "components/hero.tsx", "content": "...full file content..."}]

If no changes are needed, return an empty array: []`;

  const userMessage = `Here are the current source files:\n\n${fileList}\n\nUser request: ${prompt}`;

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
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty response from Claude");

  return JSON.parse(text);
}

// Write modified files
async function writeFiles(changes) {
  for (const { path, content } of changes) {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    await writeFile(path, content, "utf-8");
    console.log(`  Updated: ${path}`);
  }
}

// Main
async function main() {
  console.log(`Anteater agent starting...`);
  console.log(`Prompt: "${args.prompt}"`);

  const filePaths = await collectFiles();
  console.log(`Found ${filePaths.length} editable files`);

  if (filePaths.length === 0) {
    console.log("No files matched allowed globs. Exiting.");
    process.exit(0);
  }

  const fileContents = await readFiles(filePaths);
  console.log(`Read ${Object.keys(fileContents).length} files`);

  console.log("Calling Claude...");
  const changes = await callClaude(args.prompt, fileContents);

  if (!Array.isArray(changes) || changes.length === 0) {
    console.log("No changes needed.");
    process.exit(0);
  }

  console.log(`Agent wants to modify ${changes.length} file(s):`);
  await writeFiles(changes);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Anteater agent failed:", err);
  process.exit(1);
});
