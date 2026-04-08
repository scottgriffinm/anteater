<h1 align="center">Anteater — Let users make your app</h1>

<p align="center">
  <img src="anteater.svg" alt="Anteater" width="200" />
</p>

<br/>

Adds a prompt bar to your Next.js + Vercel app to let users vibecode in prod.

## Prerequisites

- A Next.js app deployed on [Vercel](https://vercel.com), connected to a GitHub repo (Vercel auto-deploys on push)
- [GitHub CLI](https://cli.github.com) installed

## Setup

```
npx next-anteater setup
```

Four steps: Anthropic key, GitHub PAT, editable paths, agent configuration. The CLI handles scaffolding, secrets, env vars, and workflow setup.

## How It Works

User prompt -> GitHub Actions -> Claude Code -> PR -> auto-merge -> Vercel redeploy

## Features

- **Real-time status:** the prompt bar tracks each run through Starting, Working, Merging, Deploying, and auto-reloads on deploy
- **Sandboxed or unrestricted:** choose whether the agent can access the internet and external tools, or stays locked to code editing only
- **Model selection:** pick from Sonnet, Opus, Opus 1M, or Haiku depending on your cost and capability needs
- **Path scoping:** restrict which files and directories the agent is allowed to modify

## Security Risks

Anteater gives users the ability to modify your application's code via AI. This is equivalent to giving everyone commit access to your repository.

- **Arbitrary code changes.** Any user with access to the prompt bar can instruct the AI agent to make any code change, including destructive ones.
- **Secret and pipeline exposure.** Anteater-generated PRs execute in GitHub Actions with access to your repository secrets and deployment pipeline.
- **No built-in access control.** Anteater does not provide authentication or authorization. The prompt bar is accessible to anyone who can load the page.
- **No safety guarantees.** This is open source software with no warranty. Contributors are not responsible for any damages. Use at your own risk.

## Where This Is Going

- UI element selection
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
