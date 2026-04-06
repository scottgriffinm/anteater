/**
 * anteater setup — Interactive CLI to install and configure Anteater.
 *
 * Core logic extracted from bin/setup-anteater.mjs so it can be
 * imported by tests without hitting the shebang line.
 */

import { execSync } from "node:child_process";
import {
  bold, dim, green, red, yellow, cyan,
  ok, fail, warn, info, heading, blank,
  ask, confirm, select, spinner,
} from "./ui.mjs";
import { detectProject } from "./detect.mjs";
import { scaffoldFiles } from "./scaffold.mjs";
import {
  validateAnthropicKey, validateGitHubToken, setGitHubSecret, setVercelEnv,
  writeEnvLocal, hasCommand,
} from "./secrets.mjs";

const cwd = process.cwd();

export async function main() {
  console.log();
  console.log(`  ${bold("\u{1F41C} Anteater Setup")}`);
  console.log(`  ${"\u2500".repeat(17)}`);
  blank();

  // ─── Preflight checks ──────────────────────────────────────
  heading("Preflight");

  if (!hasCommand("gh")) {
    fail("GitHub CLI (gh) is required. Install it: https://cli.github.com");
    process.exit(1);
  }
  ok("GitHub CLI installed");

  if (!hasCommand("vercel")) {
    fail("Vercel CLI is required. Install it: npm i -g vercel");
    process.exit(1);
  }
  ok("Vercel CLI installed");

  // ─── Detect project ─────────────────────────────────────────
  const project = await detectProject(cwd);

  if (!project.isNextJs) {
    fail("No Next.js project found. Run this from your Next.js project root.");
    process.exit(1);
  }
  ok(`Next.js ${project.nextVersion ?? ""} ${project.isAppRouter ? "(App Router)" : "(Pages Router)"}`);

  if (!project.hasGit || !project.gitRemote) {
    fail("No GitHub remote found. Run: git remote add origin <url>");
    process.exit(1);
  }
  ok(`Repo: ${project.gitRemote}`);
  ok(`Branch: ${project.defaultBranch || "main"}`);
  ok(`Package manager: ${project.packageManager}`);
  blank();

  // ─── Step 1: Anthropic API key ──────────────────────────────
  heading("Step 1 of 4 \u2014 AI Provider");
  info(`Get a key at ${cyan("https://console.anthropic.com/keys")}`);
  blank();

  let anthropicKey;
  while (true) {
    anthropicKey = await ask("Anthropic API key:", { mask: true });
    if (!anthropicKey) { warn("Required."); continue; }
    const valid = await spinner("Validating", () => validateAnthropicKey(anthropicKey));
    if (valid) break;
    fail("Invalid key. Check that it starts with sk-ant- and try again.");
  }
  blank();

  // ─── Step 2: GitHub access ──────────────────────────────────
  heading("Step 2 of 4 \u2014 GitHub Access");

  let githubToken;
  try {
    githubToken = execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    fail("GitHub CLI not authenticated. Run: gh auth login");
    process.exit(1);
  }

  // OAuth tokens (gho_*) expire in ~8 hours \u2014 not suitable for Vercel env
  if (githubToken.startsWith("gho_")) {
    warn("Your GitHub CLI token is a short-lived OAuth token (expires in ~8 hours).");
    info("Anteater needs a long-lived Personal Access Token (PAT) for the deployed API route.");
    info(`Create one at ${cyan("https://github.com/settings/tokens")} with ${bold("repo")} + ${bold("workflow")} scopes.`);
    blank();
    githubToken = await ask("Paste your GitHub PAT (ghp_... or github_pat_...):");
    if (!githubToken) {
      fail("A GitHub PAT is required.");
      process.exit(1);
    }
  } else {
    ok("Using token from GitHub CLI");
  }

  const check = await spinner("Checking permissions", () =>
    validateGitHubToken(githubToken, project.gitRemote)
  );

  if (!check.ok && check.missing.length > 0 && !check.missing.includes("unknown")) {
    if (githubToken.startsWith("ghp_") || githubToken.startsWith("github_pat_")) {
      fail("Token is missing required scopes: " + check.missing.join(", "));
      info("Create a new PAT with repo + workflow scopes.");
      process.exit(1);
    }
    info("Upgrading token scopes...");
    try {
      execSync(`gh auth refresh --scopes ${check.missing.join(",")}`, { stdio: "inherit" });
      githubToken = execSync("gh auth token", { encoding: "utf-8" }).trim();
      ok("Token scopes updated");
    } catch {
      fail("Could not upgrade token. Run: gh auth refresh --scopes repo,workflow");
      process.exit(1);
    }
  } else if (check.ok) {
    ok("Token has required permissions");
  }
  blank();

  // ─── Step 3: Configure paths ────────────────────────────────
  heading("Step 3 of 4 \u2014 Editable Paths");

  const defaultAllowed = [];
  const defaultBlocked = ["lib/auth/**", "lib/billing/**", ".env*"];

  if (project.isAppRouter) {
    defaultAllowed.push("app/**", "components/**", "styles/**");
    defaultBlocked.push("app/api/**");
  } else {
    defaultAllowed.push("pages/**", "components/**", "styles/**");
    defaultBlocked.push("pages/api/**");
  }

  console.log(`  ${green("Allowed:")} ${defaultAllowed.join(", ")}`);
  console.log(`  ${red("Blocked:")} ${defaultBlocked.join(", ")}`);
  blank();

  const useDefaults = await confirm("Use these defaults?");
  let allowedGlobs = defaultAllowed;
  let blockedGlobs = defaultBlocked;

  if (!useDefaults) {
    const customAllowed = await ask("Allowed globs (comma-separated):");
    const customBlocked = await ask("Blocked globs (comma-separated):");
    if (customAllowed) allowedGlobs = customAllowed.split(",").map((s) => s.trim());
    if (customBlocked) blockedGlobs = customBlocked.split(",").map((s) => s.trim());
  }
  blank();

  // ─── Step 4: Agent configuration ─────────────────────────────
  heading("Step 4 of 4 \u2014 Agent Configuration");

  const model = await select("Select AI model:", [
    { label: "Sonnet (recommended)", hint: "fast, cost-effective, great for most changes", value: "sonnet" },
    { label: "Opus", hint: "most capable, higher cost", value: "opus" },
    { label: "Opus 1M", hint: "Opus with extended context (1M tokens)", value: "opus[1m]" },
    { label: "Haiku", hint: "fastest, lowest cost, best for simple changes", value: "haiku" },
  ]);
  ok(`Model: ${model}`);
  blank();

  let permissionsMode = await select("Select agent permissions mode:", [
    { label: "Sandboxed (recommended)", hint: "full local access, no internet or external services", value: "sandboxed" },
    { label: "Unrestricted", hint: "full access including web, GitHub CLI, Vercel, and all MCP tools", value: "unrestricted" },
  ]);

  if (permissionsMode === "unrestricted") {
    blank();
    warn("Unrestricted mode grants the AI agent full access to:");
    info("  - Internet (web fetches, searches, curl)");
    info("  - GitHub CLI (push, PR creation, issue management)");
    info("  - Vercel CLI (deployments, env vars)");
    info("  - All MCP tools (browser automation, etc.)");
    info("  - File deletion and system commands");
    blank();
    warn("The agent will run with bypassPermissions \u2014 no confirmation prompts.");
    warn("Only use this if you trust the prompts your users will submit.");
    blank();
    const confirmed = await confirm("Confirm unrestricted mode?", false);
    if (!confirmed) {
      permissionsMode = "sandboxed";
      ok("Falling back to Sandboxed mode");
    } else {
      ok("Unrestricted mode confirmed");
    }
  } else {
    ok("Sandboxed mode \u2014 agent cannot access internet or external services");
  }
  blank();

  // ─── Install & scaffold ─────────────────────────────────────
  heading("Installing");

  const installCmd = {
    pnpm: "pnpm add @anteater/next",
    yarn: "yarn add @anteater/next",
    npm: "npm install @anteater/next",
  }[project.packageManager];

  await spinner("Installing @anteater/next", () => {
    execSync(installCmd, { cwd, stdio: "ignore" });
  });

  const productionBranch = project.defaultBranch || "main";
  const scaffolded = await spinner("Creating files", () =>
    scaffoldFiles(cwd, {
      repo: project.gitRemote,
      allowedGlobs,
      blockedGlobs,
      autoMerge: true,
      productionBranch,
      isTypeScript: project.isTypeScript,
      isAppRouter: project.isAppRouter,
      layoutFile: project.layoutFile,
      model,
      permissionsMode,
    })
  );

  for (const f of scaffolded) ok(`Created ${f}`);

  // ─── Set secrets ────────────────────────────────────────────
  heading("Configuring secrets");

  // GitHub Actions secret
  try {
    await spinner("Setting ANTHROPIC_API_KEY in GitHub secrets", () => {
      setGitHubSecret(project.gitRemote, "ANTHROPIC_API_KEY", anthropicKey);
    });
  } catch (err) {
    warn(`Could not set secret: ${err.message}`);
    info("Set manually: gh secret set ANTHROPIC_API_KEY --repo " + project.gitRemote);
  }

  // .env.local for local dev (only GITHUB_TOKEN needed)
  await spinner("Writing .env.local", () =>
    writeEnvLocal(cwd, { GITHUB_TOKEN: githubToken })
  );

  // Vercel: only GITHUB_TOKEN needed (repo auto-detected, deploy detection automatic)
  await spinner("Setting GITHUB_TOKEN in Vercel", () => {
    setVercelEnv("GITHUB_TOKEN", githubToken);
  });

  // ─── Push workflow ──────────────────────────────────────────
  if (scaffolded.some((f) => f.includes("anteater.yml"))) {
    await spinner("Pushing workflow to GitHub", () => {
      execSync(`git add .github/workflows/anteater.yml`, { cwd, stdio: "ignore" });
      execSync(`git commit -m "chore: add Anteater workflow"`, { cwd, stdio: "ignore" });
      execSync(`git push origin ${productionBranch}`, { cwd, stdio: "ignore" });
    });

    // Verify
    const activated = await spinner("Verifying workflow", async () => {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(
          `https://api.github.com/repos/${project.gitRemote}/actions/workflows`,
          { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
        );
        const data = await res.json();
        return data.workflows?.some((w) => w.path === ".github/workflows/anteater.yml" && w.state === "active");
      } catch { return false; }
    });

    if (activated) ok("Workflow active");
    else warn(`Check: ${cyan(`https://github.com/${project.gitRemote}/actions`)}`);
  }

  // ─── Test ───────────────────────────────────────────────────
  const dispatchOk = await spinner("Running test dispatch", async () => {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${project.gitRemote}/actions/workflows/anteater.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            ref: productionBranch,
            inputs: {
              requestId: "setup-test",
              prompt: "setup verification \u2014 no changes expected",
              mode: "prod",
              branch: "anteater/setup-test",
              baseBranch: productionBranch,
              autoMerge: "false",
            },
          }),
        }
      );
      return res.status === 204;
    } catch { return false; }
  });

  if (dispatchOk) ok("Pipeline is working");
  else warn("Test dispatch failed \u2014 check GitHub Actions");

  // ─── Done! ──────────────────────────────────────────────────
  blank();
  console.log(`  ${bold(green("\u{1F41C} Anteater is ready."))}`);
  blank();
  info(`Deploy your app and look for the "${green("Edit this page")}" button.`);
  info("Users can modify your app by typing changes in the Anteater bar.");
  blank();
}
