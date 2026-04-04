#!/usr/bin/env node

/**
 * setup-anteater — Interactive CLI to install and configure Anteater.
 *
 * Usage:
 *   npx setup-anteater
 *   npx setup-anteater init
 */

import { execSync } from "node:child_process";
import {
  bold, dim, green, red, yellow, cyan,
  ok, fail, warn, info, heading, blank,
  ask, confirm, select, spinner,
} from "../lib/ui.mjs";
import { detectProject } from "../lib/detect.mjs";
import { scaffoldFiles } from "../lib/scaffold.mjs";
import {
  validateAnthropicKey, setGitHubSecret, setVercelEnv,
  generateSecret, writeEnvLocal,
} from "../lib/secrets.mjs";

const cwd = process.cwd();

async function main() {
  console.log();
  console.log(`  ${bold("🐜 Anteater Setup")}`);
  console.log(`  ${"─".repeat(17)}`);
  blank();

  // ─── Detect project ─────────────────────────────────────────
  heading("Detecting project");

  const project = await detectProject(cwd);

  if (!project.isNextJs) {
    fail("No Next.js project found in this directory.");
    info("Anteater currently supports Next.js projects only.");
    info("Run this command from the root of your Next.js project.");
    process.exit(1);
  }

  ok(`Next.js ${project.nextVersion ?? "(unknown version)"} ${project.isAppRouter ? "(App Router)" : project.isPagesRouter ? "(Pages Router)" : ""}`);
  if (project.isTypeScript) ok("TypeScript");
  if (project.hasGit) ok(`Git repo: ${project.gitRemote ?? "(no remote)"}`);
  else {
    fail("No git repository found. Initialize one first: git init");
    process.exit(1);
  }

  if (!project.gitRemote) {
    fail("No GitHub remote found. Add one first: git remote add origin ...");
    process.exit(1);
  }

  ok(`Package manager: ${project.packageManager}`);
  blank();

  // ─── Step 1: Anthropic API key ──────────────────────────────
  heading("Step 1 of 4 — AI Provider");
  info("Anteater uses Claude to edit your code. You'll need an Anthropic API key.");
  info(`Don't have one? Get it here → ${cyan("https://console.anthropic.com/keys")}`);
  blank();

  let anthropicKey;
  while (true) {
    anthropicKey = await ask("Paste your Anthropic API key:", { mask: true });
    if (!anthropicKey) {
      warn("API key is required.");
      continue;
    }

    const valid = await spinner("Validating API key", () => validateAnthropicKey(anthropicKey));
    if (valid) break;

    fail("Invalid API key. Check that it starts with sk-ant- and try again.");
  }
  blank();

  // ─── Step 2: GitHub access ──────────────────────────────────
  heading("Step 2 of 4 — GitHub Access");
  info("Anteater needs a GitHub token to create branches, commit code, and open PRs.");
  blank();

  let githubToken;
  const authMethod = await select("How would you like to authenticate?", [
    { value: "gh", label: "Use existing GitHub CLI auth", hint: "recommended if gh is installed" },
    { value: "pat", label: "Paste a personal access token", hint: "needs repo + workflow scopes" },
  ]);

  if (authMethod === "gh") {
    try {
      githubToken = execSync("gh auth token", { encoding: "utf-8" }).trim();
      ok("Using token from GitHub CLI");
    } catch {
      fail("GitHub CLI not authenticated. Run: gh auth login");
      info("Or re-run setup and choose the PAT option.");
      process.exit(1);
    }
  } else {
    info("Create a fine-grained PAT with these permissions on your repo:");
    info("  • Contents: Read and Write");
    info("  • Pull Requests: Read and Write");
    info("  • Actions: Read and Write");
    info(`Generate one here → ${cyan(`https://github.com/settings/personal-access-tokens/new`)}`);
    blank();
    githubToken = await ask("Paste your GitHub token:", { mask: true });
    if (!githubToken) {
      fail("GitHub token is required.");
      process.exit(1);
    }
    ok("Token saved");
  }
  blank();

  // ─── Step 3: Configure paths ────────────────────────────────
  heading("Step 3 of 4 — Configure Editable Paths");
  info("Choose which paths Anteater's AI agent is allowed to edit.");
  blank();

  // Smart defaults based on project structure
  const defaultAllowed = [];
  const defaultBlocked = ["lib/auth/**", "lib/billing/**", ".env*"];

  if (project.isAppRouter) {
    defaultAllowed.push("app/**", "components/**", "styles/**");
    defaultBlocked.push("app/api/**");
  }
  if (project.isPagesRouter) {
    defaultAllowed.push("pages/**", "components/**", "styles/**");
    defaultBlocked.push("pages/api/**");
  }
  if (!defaultAllowed.length) {
    defaultAllowed.push("app/**", "components/**", "styles/**");
  }

  console.log(`  ${green("Allowed")} (AI can edit):`);
  for (const g of defaultAllowed) console.log(`    ${green("✓")} ${g}`);
  blank();
  console.log(`  ${red("Blocked")} (AI cannot edit):`);
  for (const g of defaultBlocked) console.log(`    ${red("✗")} ${g}`);
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

  const autoMerge = await confirm("Auto-merge safe changes (UI/style only)?");
  blank();

  // ─── Step 4: Install & scaffold ─────────────────────────────
  heading("Step 4 of 4 — Installing");

  // Install @anteater/next
  const installCmd = {
    pnpm: "pnpm add @anteater/next",
    yarn: "yarn add @anteater/next",
    npm: "npm install @anteater/next",
  }[project.packageManager];

  await spinner("Installing @anteater/next", () => {
    execSync(installCmd, { cwd, stdio: "ignore" });
  });

  // Scaffold files
  const scaffolded = await spinner("Creating Anteater files", () =>
    scaffoldFiles(cwd, {
      repo: project.gitRemote,
      allowedGlobs,
      blockedGlobs,
      autoMerge,
      isTypeScript: project.isTypeScript,
      isAppRouter: project.isAppRouter,
      layoutFile: project.layoutFile,
    })
  );

  for (const f of scaffolded) {
    ok(`Created ${f}`);
  }

  // ─── Set up secrets ─────────────────────────────────────────
  const anteaterSecret = generateSecret();

  // GitHub Actions secrets
  try {
    await spinner("Saving ANTHROPIC_API_KEY to GitHub secrets", () => {
      setGitHubSecret(project.gitRemote, "ANTHROPIC_API_KEY", anthropicKey);
    });
  } catch (err) {
    warn(`Could not set GitHub secret automatically: ${err.message}`);
    info("Set it manually: gh secret set ANTHROPIC_API_KEY --repo " + project.gitRemote);
  }

  // .env.local for local dev
  await spinner("Writing .env.local", () =>
    writeEnvLocal(cwd, {
      GITHUB_TOKEN: githubToken,
      ANTEATER_SECRET: anteaterSecret,
      ANTEATER_GITHUB_REPO: project.gitRemote,
    })
  );

  // Try Vercel env vars
  const vercelOk = await spinner("Setting Vercel environment variables", async () => {
    const a = setVercelEnv("GITHUB_TOKEN", githubToken);
    const b = setVercelEnv("ANTEATER_SECRET", anteaterSecret);
    const c = setVercelEnv("ANTEATER_GITHUB_REPO", project.gitRemote);
    return a && b && c;
  }).catch(() => false);

  if (!vercelOk) {
    warn("Vercel CLI not available or project not linked.");
    info("Set these env vars in your Vercel dashboard:");
    info(`  GITHUB_TOKEN = ${dim("(your token)")}`);
    info(`  ANTEATER_SECRET = ${anteaterSecret}`);
    info(`  ANTEATER_GITHUB_REPO = ${project.gitRemote}`);
  }

  // ─── Done! ──────────────────────────────────────────────────
  blank();
  console.log(`  ${bold(green("Done! Anteater is ready."))}`);
  console.log(`  ${"─".repeat(25)}`);
  info(`Run ${cyan(`${project.packageManager} dev`)} and look for the "${green("Edit this page")}" button.`);
  blank();
  info("Your users can now modify your app by typing in the Anteater bar.");
  info("All changes go through PRs — nothing touches main without your rules.");
  blank();
}

main().catch((err) => {
  console.error(`\n  ${red("Error:")} ${err.message}\n`);
  process.exit(1);
});
