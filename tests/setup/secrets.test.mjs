import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process
const mockExecSync = vi.fn();
vi.mock("node:child_process", () => ({ execSync: mockExecSync }));

const { hasCommand, validateAnthropicKey, validateGitHubToken, setGitHubSecret, setVercelEnv, writeEnvLocal } =
  await import("../../packages/setup-anteater/lib/secrets.mjs");

let originalFetch;

beforeEach(() => {
  vi.clearAllMocks();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("hasCommand", () => {
  it("returns true when command exists", () => {
    mockExecSync.mockReturnValue("");
    expect(hasCommand("gh")).toBe(true);
  });

  it("returns false when command is missing", () => {
    mockExecSync.mockImplementation(() => { throw new Error("not found"); });
    expect(hasCommand("nope")).toBe(false);
  });
});

describe("validateAnthropicKey", () => {
  it("returns true for status 200", async () => {
    globalThis.fetch = async () => ({ status: 200 });
    expect(await validateAnthropicKey("sk-ant-test")).toBe(true);
  });

  it("returns true for status 400 (valid key, bad request)", async () => {
    globalThis.fetch = async () => ({ status: 400 });
    expect(await validateAnthropicKey("sk-ant-test")).toBe(true);
  });

  it("returns false for status 401", async () => {
    globalThis.fetch = async () => ({ status: 401 });
    expect(await validateAnthropicKey("sk-ant-bad")).toBe(false);
  });

  it("returns false for status 403", async () => {
    globalThis.fetch = async () => ({ status: 403 });
    expect(await validateAnthropicKey("sk-ant-bad")).toBe(false);
  });

  it("returns false on network error", async () => {
    globalThis.fetch = async () => { throw new Error("network"); };
    expect(await validateAnthropicKey("sk-ant-test")).toBe(false);
  });
});

describe("validateGitHubToken", () => {
  it("returns ok when repo and workflow scopes present", async () => {
    globalThis.fetch = async () => ({
      status: 200,
      headers: { get: (h) => h === "x-oauth-scopes" ? "repo,workflow" : null },
    });
    const result = await validateGitHubToken("ghp_test", "owner/repo");
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns missing workflow scope", async () => {
    globalThis.fetch = async () => ({
      status: 200,
      headers: { get: (h) => h === "x-oauth-scopes" ? "repo" : null },
    });
    const result = await validateGitHubToken("ghp_test", "owner/repo");
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("workflow");
  });

  it("tests dispatch for fine-grained PATs (no scopes header)", async () => {
    let callCount = 0;
    globalThis.fetch = async (url) => {
      callCount++;
      if (callCount === 1) {
        // First call: /api.github.com/ — no scopes header
        return { status: 200, headers: { get: () => "" } };
      }
      // Second call: /actions/workflows — dispatch test
      return { ok: true, status: 200 };
    };
    const result = await validateGitHubToken("github_pat_test", "owner/repo");
    expect(result.ok).toBe(true);
    expect(result.scopes).toContain("fine-grained");
  });
});

describe("setGitHubSecret", () => {
  it("calls gh secret set with correct args", () => {
    mockExecSync.mockReturnValue("");
    setGitHubSecret("owner/repo", "MY_SECRET", "secret-value");
    const call = mockExecSync.mock.calls.find((c) => c[0].includes("gh secret set"));
    expect(call).toBeDefined();
    expect(call[0]).toContain("MY_SECRET");
    expect(call[0]).toContain("--repo owner/repo");
    expect(call[1].input).toBe("secret-value");
  });
});

describe("setVercelEnv", () => {
  it("sets env for production, preview, and development", () => {
    mockExecSync.mockReturnValue("");
    setVercelEnv("GITHUB_TOKEN", "ghp_test123");
    const vercelCalls = mockExecSync.mock.calls.filter((c) => c[0].includes("vercel env add"));
    expect(vercelCalls.length).toBe(3);
    expect(vercelCalls[0][0]).toContain("production");
    expect(vercelCalls[1][0]).toContain("preview");
    expect(vercelCalls[2][0]).toContain("development");
  });
});

describe("writeEnvLocal", () => {
  it("writes new keys to .env.local without throwing", async () => {
    // writeEnvLocal dynamically imports fs — we test it doesn't throw
    // by pointing it at a temp dir (the function handles missing file gracefully)
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const tmpDir = await fs.mkdtemp(path.join(os.default.tmpdir(), "anteater-env-"));
    try {
      await writeEnvLocal(tmpDir, { GITHUB_TOKEN: "ghp_test" });
      const content = await fs.readFile(path.join(tmpDir, ".env.local"), "utf-8");
      expect(content).toContain("GITHUB_TOKEN=ghp_test");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
