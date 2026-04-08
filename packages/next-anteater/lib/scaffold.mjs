/**
 * scaffold.mjs — Thin orchestrator for Anteater file scaffolding.
 *
 * Generator functions live in ./generators/.
 * Patcher functions live in ./patchers/.
 * This module wires them together in scaffoldFiles().
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// Generators
import { generateConfig } from "./generators/config.mjs";
import { generateApiRoute } from "./generators/api-route.mjs";
import { generateClaudeSettings } from "./generators/claude-settings.mjs";
import { generateWorkflow } from "./generators/workflow.mjs";
import { generateRunsRoute } from "./generators/runs-route.mjs";

// Patchers
import {
  writeIfNotExists,
  patchApiRouteMutationGuardIfMissing,
  patchRunsRouteDeleteIfMissing,
  patchRunsRouteMutationGuardIfMissing,
  patchRunsRouteFailedTtlIfMissing,
  patchWorkflowModelInputIfPresent,
  patchRunsRouteDeploymentCompletionIfNeeded,
  patchLayout,
} from "./patchers/index.mjs";

// ---------------------------------------------------------------------------
// scaffoldFiles — the main orchestrator
// ---------------------------------------------------------------------------

export async function scaffoldFiles(cwd, options) {
  const results = [];

  // anteater.config
  const config = generateConfig(options);
  if (await writeIfNotExists(join(cwd, config.filename), config.content)) {
    results.push(config.filename);
  }

  // API route
  const route = generateApiRoute(options);
  const srcPrefix = options.hasSrcDir ? "src/" : "";
  const routeDir = options.isAppRouter ? `${srcPrefix}app/api/anteater` : `${srcPrefix}pages/api/anteater`;
  const routePath = join(cwd, routeDir, route.filename);
  const createdRoute = await writeIfNotExists(routePath, route.content);
  if (createdRoute) {
    results.push(join(routeDir, route.filename));
  } else if (await patchApiRouteMutationGuardIfMissing(routePath)) {
    results.push(`${join(routeDir, route.filename)} (patched same-origin guard)`);
  }

  // Runs API route (multi-run discovery)
  const runsRoute = generateRunsRoute(options);
  const runsDir = options.isAppRouter ? `${srcPrefix}app/api/anteater/runs` : `${srcPrefix}pages/api/anteater/runs`;
  const runsPath = join(cwd, runsDir, runsRoute.filename);
  const createdRunsRoute = await writeIfNotExists(runsPath, runsRoute.content);
  if (createdRunsRoute) {
    results.push(join(runsDir, runsRoute.filename));
  } else {
    if (await patchRunsRouteDeleteIfMissing(runsPath, options.isTypeScript)) {
      results.push(`${join(runsDir, runsRoute.filename)} (patched DELETE handler)`);
    }
    if (await patchRunsRouteMutationGuardIfMissing(runsPath)) {
      results.push(`${join(runsDir, runsRoute.filename)} (patched same-origin guard)`);
    }
    if (await patchRunsRouteFailedTtlIfMissing(runsPath)) {
      results.push(`${join(runsDir, runsRoute.filename)} (patched failed-run TTL)`);
    }
    if (await patchRunsRouteDeploymentCompletionIfNeeded(runsPath)) {
      results.push(`${join(runsDir, runsRoute.filename)} (patched deploy completion detection)`);
    }
  }

  // GitHub Action workflow
  const workflowPath = join(cwd, ".github/workflows/anteater.yml");
  if (await writeIfNotExists(workflowPath, generateWorkflow(options))) {
    results.push(".github/workflows/anteater.yml");
  } else {
    if (await patchWorkflowModelInputIfPresent(workflowPath)) {
      results.push(".github/workflows/anteater.yml (patched deprecated model input)");
    }
  }

  // Claude Code agent settings (always overwrite — reflects current choices)
  if (options.model && options.permissionsMode) {
    const settingsPath = join(cwd, ".claude/settings.local.json");
    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, generateClaudeSettings(options), "utf-8");
    results.push(".claude/settings.local.json");
  }

  // Patch layout
  if (options.layoutFile) {
    if (await patchLayout(options.layoutFile, cwd)) {
      results.push(`${options.layoutFile} (patched)`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Re-exports so existing imports from "scaffold.mjs" continue to work
// ---------------------------------------------------------------------------

export { generateConfig, generateApiRoute, generateClaudeSettings, generateWorkflow, generateRunsRoute };
export { patchLayout };
