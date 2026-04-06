/**
 * Secrets management — sets GitHub Actions secrets and Vercel env vars.
 */
import { execSync } from "node:child_process";
import crypto from "node:crypto";

/**
 * Check if a CLI tool is available.
 */
export function hasCommand(cmd) {
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
 * Check if a GitHub token has the scopes needed to dispatch workflows.
 * Returns { ok, scopes, missing } — missing lists what's absent.
 */
export async function validateGitHubToken(token, repo) {
  try {
    // Check token scopes via the API
    const res = await fetch("https://api.github.com/", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    const scopeHeader = res.headers.get("x-oauth-scopes") || "";
    const scopes = scopeHeader.split(",").map((s) => s.trim()).filter(Boolean);

    // Fine-grained PATs don't return x-oauth-scopes — test dispatch directly
    if (!scopes.length) {
      const dispatchOk = await testDispatchAccess(token, repo);
      return { ok: dispatchOk, scopes: ["fine-grained"], missing: dispatchOk ? [] : ["actions:write"] };
    }

    const missing = [];
    if (!scopes.includes("repo")) missing.push("repo");
    if (!scopes.includes("workflow")) missing.push("workflow");
    return { ok: missing.length === 0, scopes, missing };
  } catch {
    return { ok: false, scopes: [], missing: ["unknown"] };
  }
}

/**
 * Test if a token can actually dispatch the anteater workflow.
 * Uses a dry-run approach: checks if the workflow exists and is accessible.
 */
async function testDispatchAccess(token, repo) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    return res.ok;
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
      execSync(`vercel env add ${name} ${env} --force`, {
        input: value,
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
