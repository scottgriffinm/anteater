/**
 * anteater uninstall — Removes all scaffolded Anteater files from the project.
 */
import { readFile, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { bold, green, red, dim, ok, fail, info, heading, blank } from "./ui.mjs";

const cwd = process.cwd();

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function removeFile(path, label) {
  if (await fileExists(path)) {
    await rm(path, { recursive: true });
    ok(`Removed ${label}`);
    return true;
  }
  return false;
}

/**
 * Remove AnteaterBar import and component usage from the layout file.
 */
async function unpatchLayout() {
  for (const layoutFile of ["app/layout.tsx", "app/layout.js"]) {
    const fullPath = join(cwd, layoutFile);
    if (!(await fileExists(fullPath))) continue;

    let content = await readFile(fullPath, "utf-8");
    if (!content.includes("AnteaterBar")) return false;

    // Remove import lines that contain AnteaterBar
    content = content.replace(/^.*AnteaterBar.*\n/gm, "");

    // Remove <AnteaterBar /> or <AnteaterBar ... /> on its own line
    content = content.replace(/^\s*<AnteaterBar\b[^>]*\/>\s*\n?/gm, "");
    // Remove inline <AnteaterBar /> (e.g., "{children}  <AnteaterBar />")
    content = content.replace(/\s*<AnteaterBar\b[^>]*\/>/g, "");

    // Remove <AnteaterBarWrapper /> on its own line or inline
    content = content.replace(/^\s*<AnteaterBarWrapper\s*\/>\s*\n?/gm, "");
    content = content.replace(/\s*<AnteaterBarWrapper\s*\/>/g, "");

    await writeFile(fullPath, content, "utf-8");
    ok(`Unpatched ${layoutFile}`);
    return true;
  }
  return false;
}

/**
 * Remove next-anteater from package.json dependencies.
 */
async function removeDependency() {
  const pkgPath = join(cwd, "package.json");
  if (!(await fileExists(pkgPath))) return false;

  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  let changed = false;

  if (pkg.dependencies?.["next-anteater"]) {
    delete pkg.dependencies["next-anteater"];
    changed = true;
  }
  if (pkg.devDependencies?.["next-anteater"]) {
    delete pkg.devDependencies["next-anteater"];
    changed = true;
  }

  if (changed) {
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    ok("Removed next-anteater from package.json");
  }
  return changed;
}

/**
 * Remove GITHUB_TOKEN line from .env.local if present.
 */
async function cleanEnvLocal() {
  const envPath = join(cwd, ".env.local");
  if (!(await fileExists(envPath))) return false;

  const content = await readFile(envPath, "utf-8");
  if (!content.includes("GITHUB_TOKEN=")) return false;

  const cleaned = content
    .split("\n")
    .filter((line) => !line.startsWith("GITHUB_TOKEN="))
    .join("\n");

  await writeFile(envPath, cleaned, "utf-8");
  ok("Removed GITHUB_TOKEN from .env.local");
  return true;
}

/**
 * Detect the git remote (owner/repo) for secret cleanup.
 */
function detectRepo() {
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
    const match = url.match(/github\.com[/:](.+?)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Remove ANTHROPIC_API_KEY from GitHub Actions secrets.
 */
async function removeGitHubSecret(repo) {
  try {
    execSync(`gh secret delete ANTHROPIC_API_KEY --repo ${repo}`, {
      stdio: ["pipe", "ignore", "pipe"],
    });
    ok("Removed ANTHROPIC_API_KEY from GitHub secrets");
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove GITHUB_TOKEN from Vercel environment variables.
 */
async function removeVercelEnv() {
  try {
    execSync("vercel --version", { stdio: "ignore" });
  } catch {
    return false; // Vercel CLI not installed
  }

  let removed = false;
  for (const env of ["production", "preview", "development"]) {
    try {
      execSync(`vercel env rm GITHUB_TOKEN ${env} --yes`, {
        stdio: ["pipe", "ignore", "pipe"],
      });
      removed = true;
    } catch {
      // May not exist in this environment
    }
  }
  if (removed) ok("Removed GITHUB_TOKEN from Vercel environment variables");
  return removed;
}

export async function main() {
  console.log();
  console.log(`  ${bold("\u{1F41C} Anteater Uninstall")}`);
  console.log(`  ${"\u2500".repeat(20)}`);
  blank();

  let totalRemoved = 0;

  // ── Scaffolded files ──────────────────────────────────
  heading("Removing scaffolded files");

  // Config file
  if (await removeFile(join(cwd, "anteater.config.ts"), "anteater.config.ts")) totalRemoved++;
  if (await removeFile(join(cwd, "anteater.config.js"), "anteater.config.js")) totalRemoved++;

  // API routes
  if (await removeFile(join(cwd, "app/api/anteater"), "app/api/anteater/")) totalRemoved++;
  if (await removeFile(join(cwd, "pages/api/anteater"), "pages/api/anteater/")) totalRemoved++;

  // Wrapper component
  if (await removeFile(join(cwd, "components/anteater-bar-wrapper.tsx"), "components/anteater-bar-wrapper.tsx")) totalRemoved++;
  if (await removeFile(join(cwd, "components/anteater-bar-wrapper.js"), "components/anteater-bar-wrapper.js")) totalRemoved++;

  // GitHub workflow
  if (await removeFile(join(cwd, ".github/workflows/anteater.yml"), ".github/workflows/anteater.yml")) totalRemoved++;

  // Claude Code agent settings
  if (await removeFile(join(cwd, ".claude/settings.local.json"), ".claude/settings.local.json")) totalRemoved++;

  // ── Layout cleanup ────────────────────────────────────
  heading("Cleaning up layout");
  if (await unpatchLayout()) totalRemoved++;

  // ── Package dependency ────────────────────────────────
  heading("Removing dependency");
  if (await removeDependency()) totalRemoved++;

  // ── Environment & secrets ─────────────────────────────
  heading("Cleaning up secrets & environment");

  // .env.local
  if (await cleanEnvLocal()) totalRemoved++;

  // GitHub secret
  const repo = detectRepo();
  if (repo) {
    if (await removeGitHubSecret(repo)) totalRemoved++;
  } else {
    info("Could not detect repo — skip GitHub secret cleanup");
    info("Run manually: gh secret delete ANTHROPIC_API_KEY --repo <owner>/<repo>");
  }

  // Vercel env var
  if (await removeVercelEnv()) totalRemoved++;

  // ── Summary ───────────────────────────────────────────
  blank();
  if (totalRemoved > 0) {
    console.log(`  ${green("\u2713")} Anteater fully uninstalled (${totalRemoved} items removed).`);
    console.log(`  ${dim("Run npx next-anteater setup to reinstall.")}`);
  } else {
    console.log(`  ${dim("No Anteater files found \u2014 nothing to remove.")}`);
  }
  console.log();
}
