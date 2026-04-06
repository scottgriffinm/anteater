import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shared state that mock factories read from
const state = {
  hasGh: true,
  hasVercel: true,
  isNextJs: true,
  anthropicKeyValid: true,
  ghToken: "ghp_mock_token_12345", // default: durable classic PAT
};

// ─── Mock all dependencies (hoisted) ───────────────────────────

vi.mock("node:child_process", () => ({
  execSync: vi.fn((cmd) => {
    if (cmd.includes("gh auth token")) return state.ghToken;
    return "";
  }),
}));

vi.mock("../../packages/setup-anteater/lib/ui.mjs", () => {
  const noop = () => {};
  return {
    bold: (s) => s, dim: (s) => s, green: (s) => s, red: (s) => s,
    yellow: (s) => s, cyan: (s) => s,
    ok: noop, fail: noop, warn: noop, info: noop, heading: noop, blank: noop,
    ask: vi.fn(async (question) => {
      if (question.includes("Anthropic")) return "sk-ant-test-key-123";
      if (question.includes("PAT") || question.includes("ghp_")) return "ghp_durable_pat_token";
      return "sk-ant-test-key-123";
    }),
    confirm: vi.fn(async () => true),
    select: vi.fn(async (q, opts) => {
      // Return first option (default) for all select prompts
      return opts[0].value;
    }),
    spinner: vi.fn(async (msg, fn) => fn()),
  };
});

vi.mock("../../packages/setup-anteater/lib/detect.mjs", () => ({
  detectProject: vi.fn(async () => {
    if (!state.isNextJs) return { isNextJs: false, hasGit: false };
    return {
      isNextJs: true, nextVersion: "16.2.2", isAppRouter: true, isPagesRouter: false,
      isTypeScript: true, hasGit: true, gitRemote: "owner/repo", defaultBranch: "main",
      packageManager: "pnpm", layoutFile: "app/layout.tsx", rootDir: "/fake",
    };
  }),
}));

vi.mock("../../packages/setup-anteater/lib/scaffold.mjs", () => ({
  scaffoldFiles: vi.fn(async () => [
    "anteater.config.ts", "app/api/anteater/route.ts",
    ".github/workflows/anteater.yml",
    ".claude/settings.local.json",
    "app/layout.tsx (patched)",
  ]),
}));

vi.mock("../../packages/setup-anteater/lib/secrets.mjs", () => ({
  hasCommand: vi.fn((cmd) => {
    if (cmd === "gh") return state.hasGh;
    if (cmd === "vercel") return state.hasVercel;
    return true;
  }),
  validateAnthropicKey: vi.fn(async () => state.anthropicKeyValid),
  validateGitHubToken: vi.fn(async () => ({ ok: true, scopes: ["repo", "workflow"], missing: [] })),
  setGitHubSecret: vi.fn(),
  setVercelEnv: vi.fn(() => true),
  writeEnvLocal: vi.fn(async () => {}),
}));

// Import main() at top level — after all vi.mock() calls are hoisted.
// This avoids the vi.resetModules() + dynamic import pattern that causes
// vitest's vm.Script to choke on the shebang line.
const { main } = await import("../../packages/setup-anteater/lib/setup.mjs");

let originalFetch;
let mockExit;

beforeEach(() => {
  state.hasGh = true;
  state.hasVercel = true;
  state.isNextJs = true;
  state.anthropicKeyValid = true;
  state.ghToken = "ghp_mock_token_12345";

  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes("/actions/workflows") && !url.includes("/dispatches")) {
      return {
        ok: true,
        json: async () => ({
          workflows: [{ path: ".github/workflows/anteater.yml", state: "active" }],
        }),
      };
    }
    if (url.includes("/dispatches")) return { ok: true, status: 204 };
    return { ok: true, status: 200, json: async () => ({}) };
  };

  mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockExit.mockRestore();
  vi.clearAllMocks();
});

describe("setup flow", () => {
  it("happy path completes without error", async () => {
    await expect(main()).resolves.toBeUndefined();
  });

  it("exits when gh CLI is missing", async () => {
    state.hasGh = false;
    await expect(main()).rejects.toThrow("process.exit(1)");
  });

  it("exits when vercel CLI is missing", async () => {
    state.hasVercel = false;
    await expect(main()).rejects.toThrow("process.exit(1)");
  });

  it("exits for non-Next.js project", async () => {
    state.isNextJs = false;
    await expect(main()).rejects.toThrow("process.exit(1)");
  });

  it("prompts for PAT when gh auth token returns OAuth token", async () => {
    state.ghToken = "gho_short_lived_oauth_token";
    // ask() mock returns "ghp_durable_pat_token" when prompted for PAT
    await expect(main()).resolves.toBeUndefined();
  });

  it("passes model and permissionsMode to scaffoldFiles", async () => {
    await main();
    const { scaffoldFiles } = await import("../../packages/setup-anteater/lib/scaffold.mjs");
    const callArgs = scaffoldFiles.mock.calls[0][1];
    expect(callArgs).toHaveProperty("model", "sonnet"); // default from select mock
    expect(callArgs).toHaveProperty("permissionsMode", "sandboxed"); // default from select mock
  });

  it("falls back to sandboxed when unrestricted is declined", async () => {
    const { select, confirm: confirmMock } = await import("../../packages/setup-anteater/lib/ui.mjs");

    // Track call count to differentiate select calls
    let selectCallCount = 0;
    select.mockImplementation(async (q, opts) => {
      selectCallCount++;
      // 2nd select call is permissions mode — pick unrestricted
      if (selectCallCount === 2) return "unrestricted";
      return opts[0].value;
    });

    // Decline the unrestricted confirmation
    confirmMock.mockImplementation(async (q, defaultYes) => {
      // The unrestricted confirmation prompt defaults to false (y/N)
      if (q && q.includes("unrestricted")) return false;
      return true;
    });

    await main();

    const { scaffoldFiles } = await import("../../packages/setup-anteater/lib/scaffold.mjs");
    const callArgs = scaffoldFiles.mock.calls[0][1];
    // Should fall back to sandboxed
    expect(callArgs).toHaveProperty("permissionsMode", "sandboxed");
  });
});
