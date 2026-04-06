/**
 * anteater uninstall — Removes all scaffolded Anteater files from the project.
 */
import { readFile, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { bold, green, red, dim, ok, fail, heading, blank } from "./ui.mjs";

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

async function unpatchLayout() {
  for (const layoutFile of ["app/layout.tsx", "app/layout.js"]) {
    const fullPath = join(cwd, layoutFile);
    if (!(await fileExists(fullPath))) continue;

    let content = await readFile(fullPath, "utf-8");
    if (!content.includes("AnteaterBar")) return false;

    // Remove import lines
    content = content.replace(/^.*AnteaterBar.*\n/gm, "");
    // Remove component usage
    content = content.replace(/^\s*<AnteaterBar[^]*?\/>\s*\n?/gm, "");
    content = content.replace(/^\s*<AnteaterBarWrapper\s*\/>\s*\n?/gm, "");

    await writeFile(fullPath, content, "utf-8");
    ok(`Unpatched ${layoutFile}`);
    return true;
  }
  return false;
}

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

export async function main() {
  console.log();
  console.log(`  ${bold("\u{1F41C} Anteater Uninstall")}`);
  console.log(`  ${"\u2500".repeat(20)}`);
  blank();

  heading("Removing scaffolded files");

  let removed = 0;

  // Config file
  if (await removeFile(join(cwd, "anteater.config.ts"), "anteater.config.ts")) removed++;
  if (await removeFile(join(cwd, "anteater.config.js"), "anteater.config.js")) removed++;

  // API routes
  if (await removeFile(join(cwd, "app/api/anteater"), "app/api/anteater/")) removed++;
  if (await removeFile(join(cwd, "pages/api/anteater"), "pages/api/anteater/")) removed++;

  // Wrapper component
  if (await removeFile(join(cwd, "components/anteater-bar-wrapper.tsx"), "components/anteater-bar-wrapper.tsx")) removed++;
  if (await removeFile(join(cwd, "components/anteater-bar-wrapper.js"), "components/anteater-bar-wrapper.js")) removed++;

  // GitHub workflow
  if (await removeFile(join(cwd, ".github/workflows/anteater.yml"), ".github/workflows/anteater.yml")) removed++;

  // Unpatch layout
  heading("Cleaning up layout");
  await unpatchLayout();

  // Remove dependency
  heading("Removing dependency");
  await removeDependency();

  blank();
  if (removed > 0) {
    console.log(`  ${green("\u2713")} Anteater uninstalled. Run ${dim("npx next-anteater setup")} to reinstall.`);
  } else {
    console.log(`  ${dim("No Anteater files found — nothing to remove.")}`);
  }
  console.log();
}
