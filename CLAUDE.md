# Anteater

Monorepo for the Anteater platform. Uses pnpm workspaces + Turborepo.

## CRITICAL — NEVER Install Anteater on the Landing Page

**DO NOT** install next-anteater on `apps/web` (the landing page at www.anteater.cool). EVER. This is a hard security boundary — the landing page is a public marketing site. Installing Anteater on it would give any visitor the ability to run AI agents that modify the codebase and trigger GitHub Actions with real API keys. This is a catastrophic security risk. No exceptions, no "just for testing," no temporary installs.

If you see AnteaterBar imported in `apps/web`, **remove it immediately**.

## CRITICAL — Package Names

There is ONE npm package: **`next-anteater`**. That's it.

- **`next-anteater`** = the npm package. Published to npm. Contains EVERYTHING: CLI, React components (AnteaterBar), hooks, types. This is what external users install.
- **`@anteater/next`** = internal monorepo package only (`packages/anteater-next/`). NOT on npm. Only used by `apps/web` inside this monorepo. NEVER tell users to install this.

When scaffolding code for external projects, ALL imports must use `next-anteater`:
```ts
import { AnteaterBar } from "next-anteater";
import type { AnteaterConfig } from "next-anteater";
```

NEVER scaffold imports from `@anteater/next` — that package does not exist on npm.

## Package Structure

```
packages/
  next-anteater/     ← THE npm package (name: "next-anteater")
    bin/             ← CLI entry points (setup, uninstall)
    lib/             ← CLI logic (setup.mjs, scaffold.mjs, etc.)
    src/             ← React components, hooks, types (TypeScript source)
    dist/            ← Compiled JS + .d.ts (built from src/)
  anteater-next/     ← Internal monorepo package (name: "@anteater/next")
    src/             ← Same components, used by apps/web only
```

## npm Publishing

When publishing a new version of `next-anteater`, **always follow `tasks/npm-publish.md`**. It has the exact steps, pre-flight checks, and known gotchas.

Key points:
- Build before publish: `cd packages/next-anteater && npm run build`
- The `dist/` directory must be up to date (compiled from `src/`)
- Bin paths must NOT have `./` prefix (npm v10+ strips them silently)
- Use `.npmrc` method for auth, NOT `--token` flag
- NPM_TOKEN is in root `.env` — extract with `grep`, NEVER read the file directly
- ANTHROPIC_API_KEY is also in root `.env`

## Installing Anteater on External Projects

The setup CLI is interactive: `npx next-anteater setup`

When doing it manually (non-interactive), every step matters:
1. `npm install next-anteater` — install the package
2. Scaffold files via `scaffoldFiles()` from `lib/scaffold.mjs`
3. Set ANTHROPIC_API_KEY as GitHub secret on the repo
4. Set GITHUB_TOKEN in Vercel env vars AND `.env.local`
5. Push `.github/workflows/anteater.yml` to GitHub
6. Verify workflow is active
7. Run test dispatch to confirm pipeline works
8. Deploy to Vercel

DO NOT skip any step. DO NOT try shortcuts. Every step exists for a reason.

## GitHub Accounts

This repo uses the `scottgriffinm` personal GitHub account, NOT `sgriffin-magnoliacap`. Always `gh auth switch --user scottgriffinm` before push/PR operations on this repo.

## Vercel

- Scope: `scottgriffinm-5994s-projects`
- Landing page: www.anteater.cool

## NEVER Cut Corners — NON-NEGOTIABLE

- **Verify every step.** Never assume something worked — check the output, check the logs, check the state.
- **Run the actual tools, not shortcuts.** If the product has a CLI, use the CLI. Don't bypass it with manual hacks.
- **If something fails, diagnose the root cause.** Don't skip it, don't work around it, don't say "good enough."
- **Test end-to-end.** From the user's perspective, through every layer, all the way to production.
- **If you can't verify it, you haven't done it.** A step isn't complete until you've proven it works.
