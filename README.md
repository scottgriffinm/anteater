# Anteater

Let your users design your app.

Anteater adds a prompt bar to your Next.js app. Your users describe what they want, and an AI agent rewrites the code, merges it, and redeploys — live in under a minute.

## Setup

```
npx anteater setup
```

Three steps: Anthropic key, GitHub PAT, editable paths. Everything else is automatic.

## How it works

```
User types change → GitHub Action runs AI agent → PR auto-merges → Vercel redeploys
```

## Secrets

| Secret | Location | Expires |
|--------|----------|---------|
| `ANTHROPIC_API_KEY` | GitHub repo secret | Never |
| `GITHUB_TOKEN` | Vercel env var | Never (classic PAT) |

## Development

```bash
pnpm install
pnpm dev
pnpm test
```

## License

MIT
