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

The two packages have nearly identical `src/` directories. `next-anteater` is what gets published; `anteater-next` is consumed by `apps/web` via pnpm workspace. When updating components/hooks/types, update **both** packages to keep them in sync.

## Development

```bash
pnpm install          # install all workspace deps
pnpm dev              # turbo dev (runs apps/web)
pnpm test             # vitest (runs tests/)
pnpm build            # turbo build (builds all packages)
```

Build `next-anteater` components before publishing:
```bash
cd packages/next-anteater && npm run build
```

This compiles `src/` → `dist/`. If you skip this, users get stale or missing component exports.

## Environment Variables

See `.env.example` for required variables. The `.env` file at the repo root contains:
- `NPM_TOKEN` — for publishing to npm
- `ANTHROPIC_API_KEY` — for testing agent workflows
- `GITHUB_PAT` — for GitHub API operations

NEVER read `.env` directly. Extract values silently: `export VAR=$(grep VAR_NAME .env | cut -d= -f2-)`

## Tests

Tests live in `tests/` and run with vitest (`pnpm test`).

- `tests/setup/` — Setup CLI tests (detect, scaffold, secrets, setup flow)
- `tests/agent/` — Agent behavior tests
- `tests/fixtures/` — Test fixtures
- `tests/helpers/` — Mock helpers (fetch, shell)

## CI/CD

This monorepo has **no GitHub Actions workflows**. Workflows are scaffolded by the CLI onto external projects that install Anteater. The scaffolded workflow uses `anthropics/claude-code-action@v1` to run the agent.

## npm Publishing

When publishing a new version of `next-anteater`, **always follow `tasks/npm-publish.md`**. It has the exact steps, pre-flight checks, and known gotchas.

Key points:
- Build before publish: `cd packages/next-anteater && npm run build`
- The `dist/` directory must be up to date (compiled from `src/`)
- Bin paths must NOT have `./` prefix (npm v10+ strips them silently)
- Use `.npmrc` method for auth, NOT `--token` flag
- NPM_TOKEN is in root `.env` — extract with `grep`, NEVER read the file directly
- ANTHROPIC_API_KEY is also in root `.env`

## CRITICAL — Always Use the CLI. NEVER Bypass It.

To install Anteater on an external project: `npx next-anteater setup`
To uninstall Anteater from an external project: `npx next-anteater uninstall`

**That's it. Use the CLI. Every single time. No exceptions.**

- **NEVER** manually call `scaffoldFiles()`, `patchLayout()`, or any internal lib function to install. The CLI exists for a reason — it handles detection, validation, scaffolding, secrets, env vars, and verification in the correct order.
- **NEVER** install from a local file path (`npm install /path/to/package`). Always install from npm: `npm install next-anteater`.
- **NEVER** manually create scaffolded files (config, API routes, workflow YAML, Claude settings). The CLI does this.
- **NEVER** manually patch the layout file to add AnteaterBar. The CLI does this.
- **NEVER** manually set GitHub secrets or Vercel env vars as a substitute for running setup. The CLI does this.
- If the CLI has a bug, **fix the CLI** — don't work around it with manual steps.

The CLI is the product. If it doesn't work, nothing works. Testing must go through the CLI.

### Piping Inputs to the Setup CLI

The setup CLI is interactive but supports piped stdin. The inputs it expects **depend on the GitHub token type**:

**If `gh auth token` returns an OAuth token (`gho_*`)** — CLI will ask for a PAT:
```bash
printf '%s\n' "$ANTHROPIC_KEY" "$GITHUB_PAT" "Y" "4" "1" | npx next-anteater setup
```
Inputs: (1) Anthropic key, (2) GitHub PAT, (3) accept default paths, (4) model choice, (5) permissions mode.

**If `gh auth token` returns a classic PAT (`ghp_*`)** — CLI skips the PAT prompt:
```bash
printf '%s\n' "$ANTHROPIC_KEY" "Y" "4" "1" | npx next-anteater setup
```
Inputs: (1) Anthropic key, (2) accept default paths, (3) model choice, (4) permissions mode.

**Check which case you're in BEFORE piping.** If you pipe the wrong number of inputs, answers shift and the CLI gets garbage for every subsequent prompt. The `gh auth token` prefix tells you: `gho_` = OAuth (5 inputs), `ghp_`/`github_pat_` = PAT (4 inputs).

Model choices: 1=Sonnet, 2=Opus, 3=Opus 1M, 4=Haiku. Permission choices: 1=Sandboxed, 2=Unrestricted.

## Vercel

- Landing page: www.anteater.cool

## Branding

- One-liner: **"Let users make your app."**
- Install command: `npx next-anteater setup`

## Agent Guidelines

- **NEVER fabricate URLs** or present uncertain info as fact. If you don't know a URL, say so.
- **NEVER read or display .env files.** Extract values silently: `export VAR=$(grep VAR_NAME .env | cut -d= -f2-)`
- **NEVER guess.** Check memory, codebase, git, CLI output first. Don't ask questions you can answer yourself.
- **Save learnings to CLAUDE.md**, not memory files. All important info goes here so every future agent has it.

## NEVER Cut Corners — NON-NEGOTIABLE

- **Verify every step.** Never assume something worked — check the output, check the logs, check the state.
- **Run the actual tools, not shortcuts.** If the product has a CLI, use the CLI. Don't bypass it with manual hacks.
- **If something fails, diagnose the root cause.** Don't skip it, don't work around it, don't say "good enough."
- **Test end-to-end.** From the user's perspective, through every layer, all the way to production.
- **If you can't verify it, you haven't done it.** A step isn't complete until you've proven it works.
