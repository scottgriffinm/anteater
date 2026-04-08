<h1 align="center">Anteater — Let users make your app</h1>

<p align="center">
  <img src="anteater.svg" alt="Anteater" width="200" />
</p>

<br/>

Anteater adds a prompt bar to your Next.js + Vercel app. Users send changes, Claude codes it, then your app redeploys.
## Setup

```
npx next-anteater setup
```

Three steps: Anthropic key, GitHub PAT, editable paths. Everything else is automatic.

## How It Works

1. A user sends a change into the prompt bar embedded in your app
2. Anteater creates a branch and triggers a GitHub Actions workflow
3. The worflow starts a Claude Code session which makes the requested changes
4. The workflow opens a PR with auto-merge enabled
5. Once merged, Vercel redeploys your app with the changes

## Features

- **One command setup:** `npx next-anteater setup` handles scaffolding, secrets, env vars, and workflow configuration
- **Real-time status:** the prompt bar tracks each run through Starting, Working, Merging, Deploying, and auto-reloads on deploy
- **Sandboxed or unrestricted:** choose whether the agent can access the internet and external tools, or stays locked to code editing only
- **Model selection:** pick from Sonnet, Opus, Opus 1M, or Haiku depending on your cost and capability needs
- **Path scoping:** restrict which files and directories the agent is allowed to modify
- **Clean uninstall:** `npx next-anteater uninstall` removes everything it added

## Security Risks

Anteater gives users the ability to modify your application's code via AI. This is equivalent to giving someone commit access to your repository.

- **Arbitrary code changes.** Any user with access to the prompt bar can instruct the AI agent to make any code change, including destructive ones.
- **Secret and pipeline exposure.** Anteater-generated PRs execute in GitHub Actions with access to your repository secrets and deployment pipeline.
- **No built-in access control.** Anteater does not provide authentication or authorization. The prompt bar is accessible to anyone who can load the page.
- **No safety guarantees.** This is open source software with no warranty. Contributors are not responsible for any damages. Use at your own risk.

> **TL;DR:** Treat Anteater like giving someone commit access to your repo. Don't expose it to the public internet with real credentials or production data.

## Where This Is Going

- DOM selection
- Permissions management

## Development

We're looking for contributors! If you're interested, open an issue or submit a PR.

```bash
pnpm install
pnpm dev
pnpm test
```

## License

[MIT](LICENSE)
