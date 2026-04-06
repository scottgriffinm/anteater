/**
 * Project detection — figures out what kind of project we're in.
 */
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

export async function detectProject(cwd) {
  const result = {
    isNextJs: false,
    nextVersion: null,
    isAppRouter: false,
    isPagesRouter: false,
    isTypeScript: false,
    hasGit: false,
    gitRemote: null, // "owner/repo"
    hasPnpm: false,
    hasYarn: false,
    hasNpm: false,
    packageManager: "npm",
    layoutFile: null,
    rootDir: cwd,
  };

  // Check package.json
  const pkg = await readJson(join(cwd, "package.json"));
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) {
      result.isNextJs = true;
      result.nextVersion = deps.next.replace(/[\^~]/, "");
    }
    result.isTypeScript = !!deps.typescript;
  }

  // Detect router type
  if (await fileExists(join(cwd, "app", "layout.tsx")) || await fileExists(join(cwd, "app", "layout.js"))) {
    result.isAppRouter = true;
    result.layoutFile = (await fileExists(join(cwd, "app", "layout.tsx")))
      ? "app/layout.tsx"
      : "app/layout.js";
  }
  if (await fileExists(join(cwd, "pages", "_app.tsx")) || await fileExists(join(cwd, "pages", "_app.js"))) {
    result.isPagesRouter = true;
  }

  // Detect package manager
  if (await fileExists(join(cwd, "pnpm-lock.yaml")) || await fileExists(join(cwd, "pnpm-workspace.yaml"))) {
    result.hasPnpm = true;
    result.packageManager = "pnpm";
  } else if (await fileExists(join(cwd, "yarn.lock"))) {
    result.hasYarn = true;
    result.packageManager = "yarn";
  } else {
    result.hasNpm = true;
    result.packageManager = "npm";
  }

  // Detect git
  if (await fileExists(join(cwd, ".git"))) {
    result.hasGit = true;
    try {
      const remote = execSync("git remote get-url origin", { cwd, encoding: "utf-8" }).trim();
      // Extract owner/repo from various URL formats
      const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
      if (match) {
        result.gitRemote = match[1].replace(/\.git$/, "");
      }
    } catch {
      // No remote configured
    }

    // Detect default branch (what HEAD points to on the remote)
    try {
      const head = execSync("git symbolic-ref refs/remotes/origin/HEAD", { cwd, encoding: "utf-8" }).trim();
      result.defaultBranch = head.replace("refs/remotes/origin/", "");
    } catch {
      // Fallback: check local HEAD branch name
      try {
        const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8" }).trim();
        result.defaultBranch = branch;
      } catch {
        result.defaultBranch = "main";
      }
    }
  }

  return result;
}
