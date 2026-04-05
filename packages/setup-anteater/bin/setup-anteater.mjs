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
  validateAnthropicKey, validateGitHubToken, setGitHubSecret, setVercelEnv,
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
  if (project.hasGit) {
    ok(`Git repo: ${project.gitRemote ?? "(no remote)"}`);
    if (project.defaultBranch) ok(`Default branch: ${project.defaultBranch}`);
  } else {
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
    { value: "pat", label: "Paste a personal access token", hint: "fine-grained: Actions + Contents + Pull Requests" },
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

    // Validate the gh token has the right scopes
    const check = await spinner("Checking token permissions", () =>
      validateGitHubToken(githubToken, project.gitRemote)
    );

    if (!check.ok && check.missing.length > 0 && !check.missing.includes("unknown")) {
      warn(`Token is missing required scopes: ${check.missing.join(", ")}`);
      info("Upgrading token scopes automatically...");
      try {
        execSync(`gh auth refresh --scopes ${check.missing.join(",")}`, {
          stdio: "inherit",
        });
        githubToken = execSync("gh auth token", { encoding: "utf-8" }).trim();
        ok("Token scopes updated");
      } catch {
        fail("Could not upgrade token scopes.");
        info("Re-run: gh auth refresh --scopes repo,workflow");
        info("Or re-run setup and choose the PAT option.");
        process.exit(1);
      }
    } else if (check.ok) {
      ok("Token has the required permissions");
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

    // Validate the PAT
    const check = await spinner("Checking token permissions", () =>
      validateGitHubToken(githubToken, project.gitRemote)
    );

    if (!check.ok) {
      fail(`Token is missing required permissions: ${check.missing.join(", ")}`);
      info("Create a new token with the correct scopes and try again.");
      process.exit(1);
    }
    ok("Token has the required permissions");
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
  const productionBranch = project.defaultBranch || "main";
  const scaffolded = await spinner("Creating Anteater files", () =>
    scaffoldFiles(cwd, {
      repo: project.gitRemote,
      allowedGlobs,
      blockedGlobs,
      autoMerge,
      productionBranch,
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

  // ─── Activate workflow ────────────────────────────────────────
  // GitHub only registers a workflow after it sees the file in a push.
  // We commit + push the scaffolded files, then verify the workflow is active.
  if (scaffolded.some((f) => f.includes("anteater.yml"))) {
    const shouldPush = await confirm("Push Anteater files to GitHub to activate the workflow?");
    if (shouldPush) {
      await spinner("Committing and pushing Anteater files", () => {
        execSync(`git add .github/workflows/anteater.yml .github/scripts/apply-changes.mjs`, { cwd, stdio: "ignore" });
        execSync(`git commit -m "chore: add Anteater workflow and agent script"`, { cwd, stdio: "ignore" });
        execSync(`git push origin ${productionBranch}`, { cwd, stdio: "ignore" });
      });

      // Verify GitHub registered the workflow
      const activated = await spinner("Verifying workflow is active on GitHub", async () => {
        // Give GitHub a moment to process
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const res = await fetch(
            `https://api.github.com/repos/${project.gitRemote}/actions/workflows`,
            {
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
              },
            }
          );
          const data = await res.json();
          return data.workflows?.some((w) => w.path === ".github/workflows/anteater.yml" && w.state === "active");
        } catch {
          return false;
        }
      });

      if (activated) {
        ok("Workflow is active on GitHub — dispatches will work");
      } else {
        warn("Workflow not detected yet. Visit your repo's Actions tab to enable it:");
        info(`  ${cyan(`https://github.com/${project.gitRemote}/actions`)}`);
      }
    } else {
      warn("Workflow won't be active until .github/workflows/anteater.yml is pushed.");
      info("After pushing, visit your repo's Actions tab to verify it's active:");
      info(`  ${cyan(`https://github.com/${project.gitRemote}/actions`)}`);
    }
  }

  // ─── End-to-end verification ────────────────────────────────
  const shouldVerify = await confirm("Run a test dispatch to verify everything works?");
  if (shouldVerify) {
    const dispatchOk = await spinner("Sending test dispatch to GitHub Actions", async () => {
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
                prompt: "setup verification — no changes expected",
                mode: "prod",
                branch: "anteater/setup-test",
                baseBranch: productionBranch,
                autoMerge: "false",
              },
            }),
          }
        );
        return res.status === 204;
      } catch {
        return false;
      }
    });

    if (dispatchOk) {
      ok("Test dispatch succeeded — the full pipeline is working");
      info(`Check the run at: ${cyan(`https://github.com/${project.gitRemote}/actions`)}`);
    } else {
      warn("Test dispatch failed. The workflow may not be active yet, or the token lacks permissions.");
      info(`Check manually: ${cyan(`https://github.com/${project.gitRemote}/actions`)}`);
    }
  }

  // ─── Done! ──────────────────────────────────────────────────
  blank();
  console.log(`  ${bold(green("Done! Anteater is ready."))}`);
  console.log(`  ${"─".repeat(25)}`);
  info(`Run ${cyan(`${project.packageManager} dev`)} and look for the "${green("Edit this page")}" button.`);
  blank();
  info("Your users can now modify your app by typing in the Anteater bar.");
  info(`All changes go through PRs — nothing touches ${productionBranch} without your rules.`);
  blank();
}

main().catch((err) => {
  console.error(`\n  ${red("Error:")} ${err.message}\n`);
  process.exit(1);
});
