/**
 * Mock factory for node:child_process execSync.
 *
 * Usage:
 *   const { execSync, calls } = createMockShell({
 *     "gh --version": "gh version 2.40.0",
 *     "git remote get-url origin": "git@github.com:owner/repo.git",
 *   });
 *
 * `calls` is an array of { command, options } for assertion.
 * Unregistered commands throw (catches unexpected shell calls).
 */
export function createMockShell(routes = {}) {
  const calls = [];

  function execSync(command, options = {}) {
    calls.push({ command, options });

    for (const [pattern, output] of Object.entries(routes)) {
      if (command.includes(pattern)) {
        if (output instanceof Error) throw output;
        return output;
      }
    }

    // Unregistered command — throw like a failed shell call
    const err = new Error(`Mock shell: unregistered command: ${command}`);
    err.status = 1;
    throw err;
  }

  return { execSync, calls };
}
