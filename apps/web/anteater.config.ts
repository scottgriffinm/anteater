import type { AnteaterConfig } from "@anteater/next";

const config: AnteaterConfig = {
  repo: "scottgriffinm/anteater",
  productionBranch: "master",
  modes: ["prod", "copy"],
  autoMerge: true,

  allowedGlobs: [
    "apps/web/app/**",
    "apps/web/components/**",
  ],

  blockedGlobs: [
    "apps/web/app/api/**",
    ".env*",
    ".github/**",
  ],

  requireReviewFor: ["auth", "billing", "payments", "dependencies"],
  maxFilesChanged: 20,
  maxDiffBytes: 120_000,
};

export default config;
