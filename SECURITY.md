# Security

## Important: Trusted Users Only

Anteater gives users the ability to modify your application's source code via an AI agent. **This is equivalent to giving someone commit access to your repository.**

- **Only expose the Anteater prompt bar to trusted users.** Any user with access can instruct the AI to make arbitrary code changes, including destructive ones.
- **Run in a sandboxed environment without real data.** The AI agent runs in GitHub Actions with access to your repository secrets and deployment pipeline. A malicious or careless prompt could access sensitive data, delete files, or break your application.
- **You are responsible for access control.** Anteater does not provide authentication or authorization. You must protect the prompt bar behind your own auth layer.

## Reporting a Vulnerability

If you discover a security vulnerability in Anteater, please report it responsibly:

1. **Do not open a public issue.**
2. Use [GitHub's private vulnerability reporting](https://github.com/scottgriffinm/anteater/security/advisories/new) to submit a report.
3. Include steps to reproduce if possible.

## Scope

Anteater's security model assumes:

- The developer installing Anteater controls who can access the prompt bar.
- The deployment environment (Vercel, GitHub Actions) is configured with least-privilege secrets.
- The `allowedGlobs` and `blockedGlobs` in `anteater.config` are set appropriately to limit what the agent can modify.

Anteater does **not** protect against:

- Prompt injection from users who have access to the prompt bar (they are trusted by design).
- Exfiltration of secrets available in the GitHub Actions environment.
- Destructive changes from users with prompt bar access.

If you expose Anteater to untrusted users or the public internet, **you do so at your own risk.**
