<h1 align="center">Anteater — Let users make your app</h1>

<p align="center">
  <img src="anteater.svg" alt="Anteater" width="200" />
</p>

<div align="center">

[![npm](https://img.shields.io/npm/v/next-anteater?color=0183ff&style=flat)](https://www.npmjs.com/package/next-anteater)
[![license](https://img.shields.io/github/license/scottgriffinm/anteater?color=0183ff&style=flat)](https://github.com/scottgriffinm/anteater/blob/master/LICENSE)
[![stars](https://img.shields.io/github/stars/scottgriffinm/anteater?logo=github&color=0183ff&style=flat)](https://github.com/scottgriffinm/anteater/stargazers)

</div>

<div align="center">
<a href="https://www.anteater.cool">Website</a> &middot; <a href="https://www.npmjs.com/package/next-anteater">npm</a> &middot; <a href="https://github.com/scottgriffinm/anteater/issues">Issues</a>
</div>

<br/>

Anteater adds a prompt bar to your Next.js app. When a user describes a change, Claude edits the code, opens a PR, and redeploys automatically — all through GitHub Actions.

## Setup

```
npx next-anteater setup
```

Three steps: Anthropic key, GitHub PAT, editable paths. Everything else is automatic.

## How It Works

```
User types change  →  GitHub Action runs AI agent  →  PR auto-merges  →  Vercel redeploys
```

1. A user types a change into the prompt bar embedded in your app
2. Anteater creates a branch and triggers a GitHub Actions workflow
3. A Claude Code agent makes the requested code changes autonomously
4. The workflow opens a PR with auto-merge enabled
5. Once merged, Vercel redeploys your app with the changes live

The agent runs as a full multi-turn [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session — it can read files, edit code, run builds, and iterate on errors across up to 50 turns.

## Features

- **One command setup** — `npx next-anteater setup` handles scaffolding, secrets, env vars, and workflow configuration
- **Real-time status** — the prompt bar tracks each run through Starting, Working, Merging, Deploying, and auto-reloads on deploy
- **Sandboxed or unrestricted** — choose whether the agent can access the internet and external tools, or stays locked to code editing only
- **Model selection** — pick from Sonnet, Opus, Opus 1M, or Haiku depending on your cost and capability needs
- **Path scoping** — restrict which files and directories the agent is allowed to modify
- **Clean uninstall** — `npx next-anteater uninstall` removes everything it added

## Security Warning

Anteater gives users the ability to modify your application's code via AI. This is equivalent to giving someone commit access to your repository.

- **Only expose Anteater to trusted users.** Any user with access to the prompt bar can instruct the AI agent to make arbitrary code changes, including destructive ones.
- **Run in a sandboxed environment without real data.** Anteater-generated PRs execute in GitHub Actions with access to your repository secrets and deployment pipeline.
- **You are responsible for access control.** Anteater does not provide authentication or authorization. Protect the prompt bar behind your own auth layer.

> **TL;DR:** Treat Anteater like giving someone commit access to your repo. Don't expose it to the public internet with real credentials or production data.

## Development

```bash
pnpm install
pnpm dev
pnpm test
```

## License

[MIT](LICENSE)
