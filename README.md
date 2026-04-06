<p align="center">
  <img src="anteater.svg" alt="Anteater" width="200" />
</p>

# Anteater

Let users make your app.

Anteater adds a prompt bar to your Next.js app. When a user describes a change, Claude edits the code, opens a PR, and redeploys automatically (all via Github actions).

## Setup

```
npx next-anteater setup
```

Three steps: Anthropic key, GitHub PAT, editable paths. Everything else is automatic.

## How it works

```
User types change → GitHub Action runs AI agent → PR auto-merges → Vercel redeploys
```

## Development

```bash
pnpm install
pnpm dev
pnpm test
```

## License

MIT
