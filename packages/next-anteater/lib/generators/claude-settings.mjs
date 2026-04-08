/**
 * Generates the .claude/settings.local.json file that configures agent
 * permissions (sandboxed vs unrestricted) and model selection.
 */

/**
 * Generate .claude/settings.local.json for agent permissions.
 */
export function generateClaudeSettings({ model, permissionsMode }) {
  if (permissionsMode === "unrestricted") {
    return JSON.stringify({
      model,
      alwaysThinkingEnabled: true,
      skipDangerousModePermissionPrompt: true,
      permissions: {
        defaultMode: "bypassPermissions",
        allow: [
          "Bash", "Edit", "Write", "MultiEdit", "NotebookEdit",
          "WebFetch", "WebSearch", "Skill", "mcp__*",
        ],
        deny: [],
      },
    }, null, 2) + "\n";
  }

  // Sandboxed (default)
  return JSON.stringify({
    model,
    alwaysThinkingEnabled: true,
    skipDangerousModePermissionPrompt: true,
    permissions: {
      defaultMode: "bypassPermissions",
      allow: [
        "Read", "Edit", "Write", "Glob", "Grep",
        "Bash(git *)", "Bash(npm *)", "Bash(pnpm *)",
        "Bash(npx *)", "Bash(node *)", "Bash(ls *)",
        "Bash(find *)", "Bash(mkdir *)", "Bash(rm *)",
        "Bash(cp *)", "Bash(mv *)",
      ],
      deny: [
        "WebFetch", "WebSearch",
        "Bash(curl *)", "Bash(wget *)",
        "Bash(gh *)", "Bash(vercel *)",
        "mcp__*",
      ],
    },
  }, null, 2) + "\n";
}
