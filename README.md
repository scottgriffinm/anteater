# Anteater

Let users edit your app by typing what they want.

Anteater adds a prompt bar to your Next.js app. When someone types a change, an AI agent edits your code, opens a PR, auto-merges it, and Vercel redeploys — all in under a minute.

## Setup

```
npx anteater setup
```

The CLI walks you through three steps:

1. **Anthropic API key** — powers the AI agent
2. **GitHub PAT** — lets the deployed app dispatch workflows
3. **Editable paths** — which files the agent can touch

Everything else is automatic: installs the package, scaffolds the API route and workflow, patches your layout, sets secrets, and runs a test dispatch.

## How it works

```
User types prompt → API route dispatches GitHub Action → AI agent edits files →
PR created → auto-merged → Vercel redeploys → user sees changes live
```

## What gets installed

| What | Where |
|------|-------|
| `@anteater/next` | npm package (AnteaterBar component + hook) |
| `anteater.config.ts` | project root |
| `app/api/anteater/route.ts` | API route for dispatch + status polling |
| `.github/workflows/anteater.yml` | GitHub Actions workflow |
| `.github/scripts/apply-changes.mjs` | AI agent script |

## Secrets

| Secret | Location | Expires |
|--------|----------|---------|
| `ANTHROPIC_API_KEY` | GitHub repo secret | Never |
| `GITHUB_TOKEN` | Vercel env var | Never (classic PAT) |

The workflow also uses `secrets.GITHUB_TOKEN` which GitHub provides automatically per run.

## Development

```bash
pnpm install
pnpm dev          # start dev server
pnpm test         # run 56 tests
pnpm build        # production build
```

## License

MIT
