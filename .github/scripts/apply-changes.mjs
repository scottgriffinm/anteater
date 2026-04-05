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

      // Skip blocked paths (segment-boundary matching to avoid false positives)
      let blocked = false;
      for (const bp of blockedGlobs) {
        const prefix = bp.replace(/\/?\*\*?$/, "");
        if (normalized === prefix || normalized.startsWith(prefix + "/")) {
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

  const validPaths = Object.keys(fileContents);
  const systemPrompt = `You are Anteater, an AI coding agent. You modify web application source files based on user requests.

RULES:
- Make minimal, focused changes that fulfill the request
- Only modify files that need to change
- Preserve existing code style and patterns
- Never modify environment files, API routes, or configuration
- Return ONLY the files you changed, in the exact format specified
- CRITICAL: The "path" in each output object MUST exactly match one of the input file paths. Do NOT shorten, rename, or strip prefixes from paths.

OUTPUT FORMAT:
Return a JSON array of objects, each with "path" (string) and "content" (string).
Return ONLY valid JSON, no markdown fences, no explanation.
The "path" must be the EXACT path as shown in the input (e.g. "${validPaths[0] || "apps/web/components/hero.tsx"}").

If no changes are needed, return an empty array: []`;

  const userMessage = `Here are the current source files:\n\n${fileList}\n\nUser request: ${prompt}`;

  console.log(`Request to Claude: model=claude-sonnet-4-20250514, input_files=${validPaths.length}, prompt="${prompt}"`);

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
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Anthropic API error: status=${res.status}, body=${err}`);
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Log token usage
  if (data.usage) {
    console.log(`Token usage: input=${data.usage.input_tokens}, output=${data.usage.output_tokens}`);
  }
  console.log(`Stop reason: ${data.stop_reason}`);

  if (data.stop_reason === "max_tokens") {
    console.error("Claude response was truncated (hit max_tokens limit). Increase max_tokens or reduce input size.");
    throw new Error("Response truncated — max_tokens exceeded");
  }

  const text = data.content?.[0]?.text;
  if (!text) {
    console.error("Empty response from Claude — full response:", JSON.stringify(data));
    throw new Error("Empty response from Claude");
  }

  // Log raw response (truncated for readability)
  const preview = text.length > 500 ? text.slice(0, 500) + "... [truncated]" : text;
  console.log(`Claude raw response preview:\n${preview}`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`Failed to parse Claude response as JSON: ${parseErr.message}`);
    console.error(`Full response text:\n${text}`);
    throw parseErr;
  }

  console.log(`Parsed ${Array.isArray(parsed) ? parsed.length : "non-array"} change(s) from Claude`);
  if (Array.isArray(parsed)) {
    for (const change of parsed) {
      console.log(`  Change target: ${change.path} (${change.content?.length ?? 0} bytes)`);
    }
  }

  return parsed;
}

// Write modified files (with diff summary)
async function writeFiles(changes, originalContents) {
  for (const { path, content } of changes) {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });

    // Log a diff summary
    const original = originalContents[path];
    if (original != null) {
      const oldLines = original.split("\n");
      const newLines = content.split("\n");
      const added = newLines.filter((l) => !oldLines.includes(l)).length;
      const removed = oldLines.filter((l) => !newLines.includes(l)).length;
      console.log(`  Updated: ${path} (+${added} -${removed} lines, ${oldLines.length} → ${newLines.length} total)`);
    } else {
      console.log(`  Created: ${path} (${content.split("\n").length} lines)`);
    }

    await writeFile(path, content, "utf-8");
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

  // Validate all returned paths match input files
  const validPathSet = new Set(Object.keys(fileContents));
  const validated = [];
  for (const change of changes) {
    if (validPathSet.has(change.path)) {
      validated.push(change);
    } else {
      console.warn(`  Rejected: ${change.path} (not in allowed input files)`);
      // Try to find the right path by matching the filename
      const basename = change.path.split("/").pop();
      const match = [...validPathSet].find((p) => p.endsWith("/" + basename));
      if (match) {
        console.log(`  Corrected: ${change.path} → ${match}`);
        validated.push({ path: match, content: change.content });
      }
    }
  }

  if (validated.length === 0) {
    console.log("No valid changes after path validation.");
    process.exit(0);
  }

  console.log(`Agent wants to modify ${validated.length} file(s):`);
  await writeFiles(validated, fileContents);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Anteater agent failed:", err);
  process.exit(1);
});
