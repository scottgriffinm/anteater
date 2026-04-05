import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

// Mock child_process
const mockExecSync = vi.fn();
vi.mock("node:child_process", () => ({ execSync: mockExecSync }));

// Mock fs/promises — we'll control what "exists" via readFile/access
const fsMock = {
  access: vi.fn(),
  readFile: vi.fn(),
};
vi.mock("node:fs/promises", () => fsMock);

// Import AFTER mocks are set up
const { detectProject } = await import("../../packages/setup-anteater/lib/detect.mjs");

const CWD = "/fake/project";

function setupNextJsProject({ router = "app", pm = "npm", remote = "git@github.com:owner/repo.git", branch = "refs/remotes/origin/main" } = {}) {
  // package.json
  fsMock.readFile.mockImplementation(async (path) => {
    if (path === join(CWD, "package.json")) {
      return JSON.stringify({
        dependencies: { next: "^16.2.2", react: "^19.0.0" },
        devDependencies: { typescript: "^5.8.0" },
      });
    }
    throw new Error("ENOENT");
  });

  // File existence
  fsMock.access.mockImplementation(async (path) => {
    const exists = [
      join(CWD, ".git"),
      ...(router === "app" ? [join(CWD, "app", "layout.tsx")] : []),
      ...(router === "pages" ? [join(CWD, "pages", "_app.tsx")] : []),
      ...(pm === "pnpm" ? [join(CWD, "pnpm-lock.yaml")] : []),
      ...(pm === "yarn" ? [join(CWD, "yarn.lock")] : []),
    ];
    if (exists.includes(path)) return;
    throw new Error("ENOENT");
  });

  // Shell commands
  mockExecSync.mockImplementation((cmd) => {
    if (cmd.includes("git remote get-url origin")) {
      if (!remote) throw new Error("no remote");
      return remote;
    }
    if (cmd.includes("git symbolic-ref")) {
      if (!branch) throw new Error("no symbolic ref");
      return branch;
    }
    if (cmd.includes("git rev-parse")) return "main";
    throw new Error(`unexpected: ${cmd}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("detectProject", () => {
  it("detects Next.js App Router project", async () => {
    setupNextJsProject({ router: "app" });
    const result = await detectProject(CWD);
    expect(result.isNextJs).toBe(true);
    expect(result.isAppRouter).toBe(true);
    expect(result.isPagesRouter).toBe(false);
    expect(result.isTypeScript).toBe(true);
    expect(result.layoutFile).toBe("app/layout.tsx");
  });

  it("detects Pages Router project", async () => {
    setupNextJsProject({ router: "pages" });
    const result = await detectProject(CWD);
    expect(result.isPagesRouter).toBe(true);
  });

  it("detects pnpm from lockfile", async () => {
    setupNextJsProject({ pm: "pnpm" });
    const result = await detectProject(CWD);
    expect(result.packageManager).toBe("pnpm");
    expect(result.hasPnpm).toBe(true);
  });

  it("detects yarn from lockfile", async () => {
    setupNextJsProject({ pm: "yarn" });
    const result = await detectProject(CWD);
    expect(result.packageManager).toBe("yarn");
    expect(result.hasYarn).toBe(true);
  });

  it("defaults to npm when no lockfile found", async () => {
    setupNextJsProject({ pm: "npm" });
    const result = await detectProject(CWD);
    expect(result.packageManager).toBe("npm");
  });

  it("parses SSH git remote URL", async () => {
    setupNextJsProject({ remote: "git@github.com:owner/repo.git" });
    const result = await detectProject(CWD);
    expect(result.gitRemote).toBe("owner/repo");
  });

  it("parses HTTPS git remote URL", async () => {
    setupNextJsProject({ remote: "https://github.com/owner/repo.git" });
    const result = await detectProject(CWD);
    expect(result.gitRemote).toBe("owner/repo");
  });

  it("handles missing git remote gracefully", async () => {
    setupNextJsProject({ remote: null });
    const result = await detectProject(CWD);
    expect(result.gitRemote).toBeNull();
  });

  it("falls back to main when branch detection fails", async () => {
    setupNextJsProject({ branch: null });
    // Override execSync to fail for both branch detection methods
    mockExecSync.mockImplementation((cmd) => {
      if (cmd.includes("git remote get-url")) return "git@github.com:owner/repo.git";
      throw new Error("fail");
    });
    const result = await detectProject(CWD);
    expect(result.defaultBranch).toBe("main");
  });

  it("detects non-Next.js project", async () => {
    fsMock.readFile.mockImplementation(async (path) => {
      if (path === join(CWD, "package.json")) {
        return JSON.stringify({ dependencies: { express: "^4.0.0" } });
      }
      throw new Error("ENOENT");
    });
    fsMock.access.mockRejectedValue(new Error("ENOENT"));
    const result = await detectProject(CWD);
    expect(result.isNextJs).toBe(false);
  });
});
