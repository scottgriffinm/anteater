# next-anteater

Let users make your app.

Anteater adds a prompt bar to your Next.js app. When a user describes a change, Claude edits the code, opens a PR, and redeploys automatically via GitHub Actions.

## Security Warning

**Anteater gives users the ability to modify your application's code via AI. Only expose it to trusted users in a sandboxed environment.**

- Users with access to the prompt bar can make **arbitrary code changes**, including destructive ones.
- The AI agent runs in GitHub Actions with access to your **repository secrets and deployment pipeline**.
- A malicious or careless prompt could **access sensitive data, delete files, or break your app**.
- Anteater does **not** provide authentication or authorization. You must protect the prompt bar behind your own auth layer.

> Treat Anteater like giving someone commit access to your repo. Never expose it to the public internet with real credentials or production data.

## Setup

```
npx next-anteater setup
```

Three steps: Anthropic key, GitHub PAT, editable paths. Everything else is automatic.

## How it works

```
User types change → GitHub Action runs AI agent → PR auto-merges → Vercel redeploys
```

## Configuration

After setup, edit `anteater.config.ts` to control:

- `allowedGlobs` / `blockedGlobs` — which files the agent can modify
- `autoMerge` — whether PRs merge automatically
- `requireReviewFor` — keywords that block auto-merge (e.g., "auth", "billing")
- `maxFilesChanged` / `maxDiffBytes` — safety limits on change size

## Security Disclaimer &#x26A0;&#xFE0F;

This software is provided "as is", without warranty of any kind. Use it at your own risk. The authors and contributors are not responsible for any damage, data loss, security breaches, or other harm resulting from the use of this software. By using Anteater, you accept full responsibility for how it is deployed, configured, and who is granted access. See [LICENSE](https://github.com/scottgriffinm/anteater/blob/master/LICENSE) for the full terms.

## License

[MIT](https://github.com/scottgriffinm/anteater/blob/master/LICENSE)
