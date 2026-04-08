/**
 * Generates the anteater.config.ts (or .js) file that defines repo settings,
 * glob patterns, and safety rules for an Anteater-enabled project.
 */

/**
 * Generate anteater.config.ts
 */
export function generateConfig({ repo, allowedGlobs, blockedGlobs, autoMerge, isTypeScript, productionBranch }) {
  const ext = isTypeScript ? "ts" : "js";
  const typeImport = isTypeScript
    ? `import type { AnteaterConfig } from "next-anteater";\n\n`
    : "";
  const typeAnnotation = isTypeScript ? ": AnteaterConfig" : "";

  return {
    filename: `anteater.config.${ext}`,
    content: `/**
 * SECURITY: Anteater lets users modify your app's code via AI.
 * Only expose the prompt bar to trusted users behind your own auth layer.
 * Users can make destructive changes and potentially access sensitive data.
 * Never use this in a production environment with real credentials.
 * See: https://github.com/scottgriffinm/anteater#security-warning
 */
${typeImport}const config${typeAnnotation} = {
  repo: "${repo}",
  productionBranch: "${productionBranch}",
  modes: ["prod", "copy"],
  autoMerge: ${autoMerge},

  allowedGlobs: [
${allowedGlobs.map((g) => `    "${g}",`).join("\n")}
  ],

  blockedGlobs: [
${blockedGlobs.map((g) => `    "${g}",`).join("\n")}
  ],

  requireReviewFor: ["auth", "billing", "payments", "dependencies"],
  maxFilesChanged: 20,
  maxDiffBytes: 120000,
};

export default config;
`,
  };
}
