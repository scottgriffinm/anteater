<p align="center">
  <img src="anteater.svg" alt="Anteater" width="200" />
</p>

# Anteater

Let users make your app.

Anteater adds a prompt bar to your Next.js app. When a user describes a change, Claude edits the code, opens a PR, and redeploys automatically (all via Github actions).

## Security Warning

**Anteater gives users the ability to modify your application's code via AI.** This is equivalent to giving someone commit access to your repository.

- **Only expose Anteater to trusted users.** Any user with access to the prompt bar can instruct the AI agent to make arbitrary code changes, including destructive ones.
- **Run in a sandboxed environment without real data.** Anteater-generated PRs execute in GitHub Actions with access to your repository secrets and deployment pipeline. A malicious or careless prompt could access sensitive data, delete files, or break your app.
- **You are responsible for access control.** Anteater does not provide authentication or authorization. Protect the prompt bar behind your own auth layer and restrict it to users you trust completely.

> **TL;DR:** Treat Anteater like giving someone commit access to your repo. Don't expose it to the public internet with real credentials or production data.

## Security Disclaimer &#x26A0;&#xFE0F;

This software is provided "as is", without warranty of any kind. Use it at your own risk. The authors and contributors are not responsible for any damage, data loss, security breaches, or other harm resulting from the use of this software. By using Anteater, you accept full responsibility for how it is deployed, configured, and who is granted access. See [LICENSE](LICENSE) for the full terms.

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

[MIT](LICENSE)
