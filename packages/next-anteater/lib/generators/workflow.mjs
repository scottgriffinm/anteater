/**
 * Generates the GitHub Actions workflow YAML (anteater.yml) that runs the
 * Claude Code agent on workflow_dispatch, creates a PR, and optionally auto-merges.
 */

/**
 * Generate the GitHub Actions workflow.
 */
export function generateWorkflow({ allowedGlobs, blockedGlobs, productionBranch, model, packageManager = "npm", permissionsMode = "sandboxed" }) {
  const allowed = allowedGlobs.join(", ");
  const blocked = blockedGlobs.join(", ");

  return `name: Anteater Apply
run-name: "anteater [\${{ inputs.requestId }}] [\${{ inputs.mode }}] \${{ inputs.prompt }}"

on:
  workflow_dispatch:
    inputs:
      requestId:
        description: "Unique request ID"
        required: true
      prompt:
        description: "Natural language change request"
        required: true
      mode:
        description: "prod or copy"
        required: true
        default: "prod"
      branch:
        description: "Branch to create and commit to"
        required: true
      baseBranch:
        description: "Base branch to fork from"
        required: true
        default: "${productionBranch}"
      autoMerge:
        description: "Auto-merge the PR if true"
        required: false
        default: "true"

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  apply:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    steps:
      - name: Checkout base branch
        uses: actions/checkout@v4
        with:
          ref: \${{ inputs.baseBranch }}
          fetch-depth: 0

      - name: Create and switch to target branch
        run: git checkout -b "\${{ inputs.branch }}"

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: ${packageManager === "pnpm" ? "npm install -g pnpm@9 --silent && pnpm install --frozen-lockfile" : packageManager === "yarn" ? "yarn install --frozen-lockfile" : "npm ci"}

      - name: Run Anteater agent
        uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            You are Anteater, an AI agent that modifies a web app based on user requests.

            USER REQUEST: \${{ inputs.prompt }}

            RULES:
            - Only edit files under: ${allowed}
            - NEVER edit: ${blocked}
            - Make minimal, focused changes
            - Preserve existing code style
            - After making changes, run the build command to verify the build passes
            - If the build fails, read the error output and fix the issues, then build again
            - Keep iterating until the build passes or you've tried 3 times
            - Do NOT commit — just leave the changed files on disk
${permissionsMode === "unrestricted" ? `
            INTERNET ACCESS: You can and are encouraged to use the internet for research,
            reference materials, images, assets, documentation, and any other resources
            that would help you complete the user's request. Use tools like WebFetch,
            WebSearch, and curl freely.
` : ""}
            IMPORTANT: Always verify your changes compile by running the build command.
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: "${permissionsMode === "unrestricted" ? "--max-turns 50" : "--allowedTools Edit,Read,Write,Bash,Glob,Grep --max-turns 50"}"
          show_full_output: true

      - name: Check for changes
        id: changes
        run: |
          git add -A
          if git diff --staged --quiet; then
            echo "has_changes=false" >> "\$GITHUB_OUTPUT"
          else
            echo "has_changes=true" >> "\$GITHUB_OUTPUT"
          fi

      - name: Commit changes
        if: steps.changes.outputs.has_changes == 'true'
        env:
          PROMPT: \${{ inputs.prompt }}
        run: |
          git config user.name "anteater[bot]"
          git config user.email "anteater[bot]@users.noreply.github.com"
          git commit -m "anteater: \${PROMPT}"

      - name: Push branch
        if: steps.changes.outputs.has_changes == 'true'
        run: |
          git remote set-url origin "https://x-access-token:\${GITHUB_TOKEN}@github.com/\${{ github.repository }}.git"
          git push origin "\${{ inputs.branch }}"
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Create pull request
        if: steps.changes.outputs.has_changes == 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PROMPT: \${{ inputs.prompt }}
          REQUEST_ID: \${{ inputs.requestId }}
          MODE: \${{ inputs.mode }}
        run: |
          gh pr create \\
            --base "\${{ inputs.baseBranch }}" \\
            --head "\${{ inputs.branch }}" \\
            --title "anteater: \${PROMPT}" \\
            --body "Automated change by Anteater (request \\\`\${REQUEST_ID}\\\`).

          **Prompt:** \${PROMPT}
          **Mode:** \${MODE}"

      - name: Auto-merge PR
        if: steps.changes.outputs.has_changes == 'true' && inputs.autoMerge == 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh pr merge "\${{ inputs.branch }}" --squash --delete-branch
`;
}
