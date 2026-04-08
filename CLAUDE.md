# Anteater

Monorepo for the Anteater platform. Uses pnpm workspaces + Turborepo.

## CRITICAL — NEVER Install Anteater on the Landing Page

**DO NOT** install next-anteater on `apps/web` (the landing page at www.anteater.cool). EVER. This is a hard security boundary — the landing page is a public marketing site. Installing Anteater on it would give any visitor the ability to run AI agents that modify the codebase and trigger GitHub Actions with real API keys. This is a catastrophic security risk. No exceptions, no "just for testing," no temporary installs.

If you see AnteaterBar imported in `apps/web`, **remove it immediately**.

## CRITICAL — Package Name

There is ONE package name: **`next-anteater`**.

- **`next-anteater`** = the package for CLI, React components (AnteaterBar), hooks, and types.

When scaffolding code for external projects, ALL imports must use `next-anteater`:
```ts
import { AnteaterBar } from "next-anteater";
import type { AnteaterConfig } from "next-anteater";
```

NEVER scaffold any alternate package name for Anteater.

## Package Structure

```
packages/
  next-anteater/     ← The Anteater package (name: "next-anteater")
    bin/             ← CLI entry points (setup, uninstall)
    lib/             ← CLI logic (setup.mjs, scaffold.mjs, etc.)
    src/             ← React components, hooks, types (TypeScript source)
    dist/            ← Compiled JS + .d.ts (built from src/)
```

Keep `next-anteater` as the single source of truth for Anteater runtime behavior.

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

### claude-code-action@v1 — What It Actually Is

The Anteater workflow agent is a **full multi-turn Claude Code instance**, not a single LLM call. It runs autonomously for up to `--max-turns` (currently 50) using the same tools as a local Claude Code session: Bash, Edit, Read, Write, Glob, Grep, WebFetch, WebSearch, etc.

**What it CAN do:**
- Run multiple autonomous turns (observed: 11 turns for a curl+edit+build task)
- Use all standard Claude Code tools including internet access (Bash curl, WebFetch, WebSearch)
- Read `.claude/settings.local.json` from the repo (`settingSources: ["user", "project", "local"]`)
- Respect `bypassPermissions` mode and tool allow/deny lists from settings
- Run builds, fix errors, iterate — full agentic loop

**What it CANNOT do (vs. a local interactive session):**
- No mid-run conversation with the user — one prompt in, autonomous execution, result out
- No MCP servers (unless configured in the workflow)
- No deferred tools like AskUserQuestion, Playwright, etc.
- Subject to `--max-turns` cap
- Logs hidden by default (`show_full_output: false`) — only summary visible (turns, cost, success/fail)

**Key workflow inputs:**
- `claude_args`: passes CLI flags (e.g. `--max-turns 50`)
- `settings`: JSON string or path to settings file (optional — repo's `.claude/settings.local.json` is loaded automatically)
- `prompt`: the task prompt
- `anthropic_api_key`: from GitHub secrets

**NEVER describe the workflow agent as "single-turn."** It is multi-turn and autonomous. The only limitation is it's non-interactive (can't ask the user follow-up questions mid-run).

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

The setup CLI is interactive but supports piped stdin. When stdin is piped, the CLI prints an agent guide showing the exact prompt order.

The CLI always asks for a GitHub PAT — there is no token-type branching.

**Model choices (input 4):**
| Input | Model | Notes |
|-------|-------|-------|
| `1` | **Sonnet** | Fast, cost-effective, good for most changes |
| `2` | **Opus** | Most capable, higher cost |
| `3` | **Opus 1M** | Opus with extended context |
| `4` | **Haiku** | Fastest, cheapest, simple changes only |

**Permission choices (input 5):**
| Input | Mode | Notes |
|-------|------|-------|
| `1` | **Sandboxed** | `--allowedTools Edit,Read,Write,Bash,Glob,Grep` — no internet |
| `2` | **Unrestricted** | No tool restrictions — full internet, GitHub CLI, MCP tools |

**Standard flow (5 inputs):**
```bash
printf '%s\n' "$ANTHROPIC_KEY" "$GITHUB_PAT" "Y" "1" "1" | npx next-anteater setup
```
Inputs: (1) Anthropic key, (2) GitHub PAT, (3) accept default paths, (4) model choice, (5) permissions mode.

**If choosing Unrestricted (6 inputs):**
```bash
printf '%s\n' "$ANTHROPIC_KEY" "$GITHUB_PAT" "Y" "1" "2" "y" | npx next-anteater setup
```
Inputs: same as above + (6) confirm unrestricted mode.

**If customizing paths (7+ inputs):**
After answering "n" to default paths, two extra prompts appear: allowed globs and blocked globs.

## Vercel

- Landing page: www.anteater.cool

## Branding

- One-liner: **"Let users make your app."**
- Install command: `npx next-anteater setup`
- **README header order**: Title/tagline (`<h1>`) goes ABOVE the logo image, not below it. The preferred format is `Anteater — Let users make your app` as h1, then the centered logo SVG underneath.
- **No em dashes in README body text.** Em dashes are fine in the h1 title (branding), but never in body paragraphs or feature lists. Use colons for definition-style bullet points (e.g. `**Feature:** description`), and periods or commas to break up sentences.
- **Security language frames risks, not recommendations.** Don't say "Only expose to trusted users" (recommendation). Say "Any user with access can make arbitrary code changes" (risk). Let the reader decide what to do about it.

## Run Status Model

Anteater shows users exactly 5 statuses during a run. There are no catch-all fallbacks — every code path maps to exactly one status.

### The 5 Statuses

| Status | UI Label | Meaning | Authoritative Signal | Exit |
|---|---|---|---|---|
| **Starting** | "Starting · Xs" | Submitted, waiting for GitHub runner | Workflow `queued`/`waiting`/`pending`, or `in_progress` but agent step not started | → Working or Failed |
| **Working** | "Working · Xs" | Agent is actively coding | Workflow `in_progress` + agent step running | → Merging or Failed |
| **Merging** | "Merging · Xs" | PR is open, auto-merge in progress | PR `state === "open"` AND workflow not failed AND PR age < 15 min | → Deploying or Failed |
| **Deploying** | "Deploying · Xs" | PR merged, Vercel building | `pr.merged_at` is set | → Removed (deploy success) or Failed |
| **Failed** | "Failed: {reason}" | Something broke | Workflow failed, deploy failed, merge stalled (>15 min), or auto-merge conflict | User dismisses or 1h auto-expiry |

### Lifecycle: Starting → Working → Merging → Deploying → Removed

When deploy succeeds, the run is removed from the API response (not shown in UI). The client detects a new `deploymentId` and reloads the page with the user's changes live.

### Where Status Logic Lives

- **Server-side decision tree**: `lib/scaffold.mjs` → `generateRunsRoute()` generates `/api/anteater/runs`. This is the source of truth for what step each run is in.
- **Client-side display**: `src/components/anteater-bar.tsx` has the `STEP_LABEL` map that converts step strings to display labels. It only displays — it does not determine status.
- **Client-side optimistic runs**: `src/hooks/use-anteater-runs.ts` shows `step: "starting"` immediately after submission (stored in localStorage) to fill the ~5-10s gap before the server picks up the workflow.
- **Type definition**: `src/types.ts` defines `AnteaterStep = "starting" | "working" | "merging" | "deploying" | "error"`.
- **Single-run status endpoint**: `lib/scaffold.mjs` → `generateStatusRoute()` generates `/api/anteater` GET. Returns the same step vocabulary. Used by the `useAnteater` hook (not used by `AnteaterBar`, which uses the runs hook).

### Key Design Rules

- **No catch-all fallbacks.** Every decision branch must produce a specific status. Never use a generic "thinking" or "unknown" state.
- **When ambiguous, pick the most likely real status.** If the workflow is `in_progress` but jobs API fails, show "Working" (it IS running). If PR is merged but deployment status is unknown, show "Deploying" (it IS deploying).
- **Cross-check workflow conclusion before showing Merging.** If the PR is open but the workflow already failed (e.g. auto-merge conflict), show Failed — not Merging.
- **Merge timeout: 15 minutes.** If a PR has been open for >15 min, show "Failed: Merge stalled."
- **Failed runs expire after 1 hour** on both server and client side.
- **Deploy success = run removed.** The run disappears from the API response, client detects new `deploymentId`, page reloads.

### Common Pitfalls (Historical Bugs)

- **"Thinking" catch-all (fixed v0.2.17):** Previously, any state the server couldn't determine fell through to `step: "thinking"`. This masked real states like deploying. Now eliminated — every branch has a real status.
- **"Deploying" dead code (fixed v0.2.17):** The runs endpoint never returned `step: "deploying"` — it only existed in the single-status endpoint. Now both endpoints return it for merged PRs.
- **Infinite "Merging" (fixed v0.2.17):** If auto-merge failed (e.g. conflict), the PR stayed open and the UI showed "Merging" forever. Now the code checks workflow conclusion and adds a 15-min timeout.

## Lessons Learned

**Say "I don't know" when you don't know.** Don't dress up guesses as conclusions.

**Scaffolded workflows must have `show_full_output: true`.** Agent logs need to be visible for debugging. Set in `lib/scaffold.mjs` on the `claude-code-action` step.

**Never dismiss test failures without proving they're pre-existing.** Always stash your changes, re-run tests on clean state, and compare. Don't hand-wave failures as "unrelated" — verify first, then explain.

**Don't ask the user for API keys when installing Anteater on external projects.** ANTHROPIC_API_KEY and GITHUB_PAT are in the Anteater repo's root `.env`. Extract them silently with `grep` and pipe them to the CLI. The user shouldn't have to tell you what you already have access to.

**Don't ask the user where their project is — find it yourself.** If they give you a project name, search the filesystem (`find` or `ls`). Only ask if you genuinely can't locate it after searching.

**When fixing UI issues, change only what's broken — don't add new effects.** If the user says an animation is laggy, fix the performance. Don't add opacity fades, easing changes, or other embellishments they didn't ask for. The user will ask for extras if they want them.

**Downloading audio/assets from the web: never guess URLs.** Sound hosting sites (mixkit, freesound, pixabay) don't serve files at predictable URLs — they use JS-rendered download buttons and anti-hotlinking. The pattern that works: (1) WebFetch the listing page to extract real file paths, (2) curl those exact paths. Known reliable sources for direct curl downloads: `soundjay.com` (paths like `human_c2026/fart-01.mp3`) and `pacdv.com` (paths like `sounds/fart-sounds/fart-5.mp3`). Always verify the downloaded file with `file <path>` to confirm it's real audio, not HTML.

**Always trace both sides of a status interface before making claims.** The scaffold template (scaffold.mjs) generates the server-side route that DETERMINES statuses. The client (anteater-bar.tsx) only DISPLAYS them. To understand what statuses users see, read the server-side decision tree AND the client display logic. Don't read one layer and extrapolate.

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

## CRITICAL — State Honesty (No Exceptions)

- **NEVER use catch-all fallback statuses.** Every code path must map to one of the 5 real steps (Starting, Working, Merging, Deploying, Failed). No "thinking", "unknown", or generic states.
- **When ambiguous, show the most likely real status.** If the workflow is running but jobs API failed, show "Working". If PR is merged but deploy status is unknown, show "Deploying". Pick the status that matches what IS happening, not a vague fallback.
- **NEVER use time-based heuristics to imply completion.** Timers may be used for timeouts only (e.g. 15-min merge stall), never to claim deploy/build/task completion.
- **NEVER silently drop active runs.** Failed runs expire after 1 hour (server + client). Successful deploys are removed (run disappears, page reloads). PRs closed without merge are removed. All other removals must be explicit.
- **Any change that touches status/progress logic must be verified end-to-end.** Submit a real task, watch it through Starting → Working → Merging → Deploying → page reload. Don't ship status changes without proving the full lifecycle works on a live deployment.
