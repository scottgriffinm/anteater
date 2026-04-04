/**
 * Secrets management — sets GitHub Actions secrets and Vercel env vars.
 */
import { execSync } from "node:child_process";
import crypto from "node:crypto";

/**
 * Check if a CLI tool is available.
 */
function hasCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random secret.
 */
export function generateSecret() {
  return `ak_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Validate an Anthropic API key by making a lightweight API call.
 */
export async function validateAnthropicKey(key) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    // 200 = valid key, 400 = valid key (bad request is fine), 401 = invalid
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

/**
 * Set a GitHub Actions secret using the gh CLI.
 */
export function setGitHubSecret(repo, name, value) {
  if (!hasCommand("gh")) {
    throw new Error("GitHub CLI (gh) is not installed. Install it: https://cli.github.com");
  }
  execSync(`gh secret set ${name} --repo ${repo} --body -`, {
    input: value,
    stdio: ["pipe", "ignore", "pipe"],
  });
}

/**
 * Set a Vercel environment variable using the vercel CLI.
 * Returns false if vercel CLI is not available.
 */
export function setVercelEnv(name, value, environments = ["production", "preview", "development"]) {
  if (!hasCommand("vercel")) {
    return false;
  }
  for (const env of environments) {
    try {
      execSync(`echo "${value}" | vercel env add ${name} ${env} --force`, {
        stdio: ["pipe", "ignore", "pipe"],
      });
    } catch {
      // May fail if not linked — that's okay
      return false;
    }
  }
  return true;
}

/**
 * Write secrets to a local .env.local file (fallback).
 */
export async function writeEnvLocal(cwd, secrets) {
  const { writeFile, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const envPath = join(cwd, ".env.local");

  let existing = "";
  try {
    existing = await readFile(envPath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const lines = [];
  for (const [key, value] of Object.entries(secrets)) {
    // Don't duplicate existing keys
    if (!existing.includes(`${key}=`)) {
      lines.push(`${key}=${value}`);
    }
  }

  if (lines.length > 0) {
    const newContent = existing + (existing.endsWith("\n") || !existing ? "" : "\n") + lines.join("\n") + "\n";
    await writeFile(envPath, newContent, "utf-8");
  }
}
