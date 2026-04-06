import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

// Mock fs/promises for scaffoldFiles and patchLayout
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
vi.mock("node:fs/promises", () => ({
  readFile: (...args) => mockReadFile(...args),
  writeFile: (...args) => mockWriteFile(...args),
  mkdir: (...args) => mockMkdir(...args),
}));

const {
  generateConfig,
  generateApiRoute,
  generateWorkflow,
  generateClaudeSettings,
  patchLayout,
  scaffoldFiles,
} = await import("../../packages/next-anteater/lib/scaffold.mjs");

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

describe("generateConfig", () => {
  it("generates TypeScript config with type import", () => {
    const result = generateConfig({
      repo: "owner/repo",
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      autoMerge: true,
      isTypeScript: true,
      productionBranch: "main",
    });
    expect(result.filename).toBe("anteater.config.ts");
    expect(result.content).toContain('import type { AnteaterConfig }');
    expect(result.content).toContain('"owner/repo"');
    expect(result.content).toContain('"app/**"');
    expect(result.content).toContain('autoMerge: true');
  });

  it("generates JavaScript config without type import", () => {
    const result = generateConfig({
      repo: "owner/repo",
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      autoMerge: false,
      isTypeScript: false,
      productionBranch: "main",
    });
    expect(result.filename).toBe("anteater.config.js");
    expect(result.content).not.toContain("import type");
    expect(result.content).toContain("autoMerge: false");
  });
});

describe("generateApiRoute", () => {
  it("generates TypeScript route with type annotations", () => {
    const result = generateApiRoute({ isTypeScript: true, productionBranch: "main" });
    expect(result.filename).toBe("route.ts");
    expect(result.content).toContain("NextRequest");
    expect(result.content).toContain("AnteaterRequest");
    expect(result.content).toContain("export async function POST");
    expect(result.content).toContain("export async function GET");
  });

  it("generates JavaScript route without type annotations", () => {
    const result = generateApiRoute({ isTypeScript: false, productionBranch: "main" });
    expect(result.filename).toBe("route.js");
    expect(result.content).not.toContain("AnteaterRequest");
    expect(result.content).toContain("export async function POST");
    expect(result.content).toContain("export async function GET");
  });

  it("embeds production branch in dispatch", () => {
    const result = generateApiRoute({ isTypeScript: true, productionBranch: "master" });
    expect(result.content).toContain('"master"');
  });

  it("includes auto-detect repo from Vercel env vars", () => {
    const result = generateApiRoute({ isTypeScript: true, productionBranch: "main" });
    expect(result.content).toContain("VERCEL_GIT_REPO_OWNER");
    expect(result.content).toContain("VERCEL_GIT_REPO_SLUG");
    expect(result.content).toContain("VERCEL_DEPLOYMENT_ID");
  });
});

describe("generateWorkflow", () => {
  it("generates workflow with correct structure", () => {
    const result = generateWorkflow({
      allowedGlobs: ["app/**", "components/**"],
      blockedGlobs: ["app/api/**", ".env*"],
      productionBranch: "main",
      model: "sonnet",
    });
    expect(result).toContain("workflow_dispatch");
    expect(result).toContain("timeout-minutes: 360");
    expect(result).toContain("actions/checkout@v4");
    expect(result).toContain("node-version: 22");
  });

  it("embeds allowed and blocked globs", () => {
    const result = generateWorkflow({
      allowedGlobs: ["src/**"],
      blockedGlobs: [".env*"],
      productionBranch: "main",
      model: "sonnet",
    });
    expect(result).toContain("src/**");
    expect(result).toContain(".env*");
    expect(result).toContain("Only edit files under");
    expect(result).toContain("NEVER edit");
  });

  it("includes auto-merge step", () => {
    const result = generateWorkflow({
      allowedGlobs: ["app/**"],
      blockedGlobs: [],
      productionBranch: "main",
      model: "sonnet",
    });
    expect(result).toContain("gh pr merge");
    expect(result).toContain("--squash");
    expect(result).toContain("--delete-branch");
  });
});

describe("generateWorkflow — claude-code-action", () => {
  it("uses anthropics/claude-code-action@v1", () => {
    const result = generateWorkflow({
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      productionBranch: "main",
      model: "sonnet",
    });
    expect(result).toContain("anthropics/claude-code-action@v1");
  });

  it("includes model in workflow", () => {
    const result = generateWorkflow({
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      productionBranch: "main",
      model: "opus[1m]",
    });
    expect(result).toContain('model: "opus[1m]"');
  });

  it("includes build verification instruction in prompt", () => {
    const result = generateWorkflow({
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      productionBranch: "main",
      model: "sonnet",
    });
    expect(result).toContain("run the build command");
    expect(result).toContain("fix the issues");
  });

  it("installs dependencies before agent step", () => {
    const result = generateWorkflow({
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      productionBranch: "main",
      model: "sonnet",
    });
    const installIdx = result.indexOf("npm ci");
    const agentIdx = result.indexOf("claude-code-action");
    expect(installIdx).toBeGreaterThan(-1);
    expect(agentIdx).toBeGreaterThan(installIdx);
  });
});

describe("generateClaudeSettings", () => {
  it("generates sandboxed settings with deny list", () => {
    const result = generateClaudeSettings({ model: "sonnet", permissionsMode: "sandboxed" });
    const parsed = JSON.parse(result);
    expect(parsed.model).toBe("sonnet");
    expect(parsed.alwaysThinkingEnabled).toBe(true);
    expect(parsed.skipDangerousModePermissionPrompt).toBe(true);
    expect(parsed.permissions.defaultMode).toBe("bypassPermissions");
    expect(parsed.permissions.allow).toContain("Edit");
    expect(parsed.permissions.allow).toContain("Bash(git *)");
    expect(parsed.permissions.deny).toContain("WebFetch");
    expect(parsed.permissions.deny).toContain("WebSearch");
    expect(parsed.permissions.deny).toContain("Bash(curl *)");
    expect(parsed.permissions.deny).toContain("mcp__*");
  });

  it("generates unrestricted settings with no deny list", () => {
    const result = generateClaudeSettings({ model: "opus[1m]", permissionsMode: "unrestricted" });
    const parsed = JSON.parse(result);
    expect(parsed.model).toBe("opus[1m]");
    expect(parsed.permissions.allow).toContain("Bash");
    expect(parsed.permissions.allow).toContain("WebFetch");
    expect(parsed.permissions.allow).toContain("WebSearch");
    expect(parsed.permissions.allow).toContain("mcp__*");
    expect(parsed.permissions.deny).toEqual([]);
  });

  it("defaults to sandboxed for unknown permissionsMode", () => {
    const result = generateClaudeSettings({ model: "haiku", permissionsMode: "unknown" });
    const parsed = JSON.parse(result);
    expect(parsed.permissions.deny.length).toBeGreaterThan(0);
  });
});

describe("patchLayout", () => {
  it("injects AnteaterBar import and component", async () => {
    mockReadFile.mockResolvedValue(`import "./globals.css";
import { Geist } from "next/font/google";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}`);

    const result = await patchLayout("app/layout.tsx", "/fake");
    expect(result).toBe(true);

    const written = mockWriteFile.mock.calls[0][1];
    expect(written).toContain('import { AnteaterBar } from "next-anteater"');
    expect(written).toContain("<AnteaterBar />");
    // AnteaterBar should be before </body>
    const barIdx = written.indexOf("<AnteaterBar />");
    const bodyIdx = written.indexOf("</body>");
    expect(barIdx).toBeLessThan(bodyIdx);
  });

  it("is idempotent — skips if already patched", async () => {
    mockReadFile.mockResolvedValue(`import { AnteaterBar } from "next-anteater";
export default function RootLayout({ children }) {
  return <html><body>{children}<AnteaterBar /></body></html>;
}`);

    const result = await patchLayout("app/layout.tsx", "/fake");
    expect(result).toBe(false);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

describe("scaffoldFiles", () => {
  it("creates all expected files for App Router TS project", async () => {
    // All files are "new" (readFile throws for existence check)
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const results = await scaffoldFiles("/fake", {
      repo: "owner/repo",
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      autoMerge: true,
      productionBranch: "main",
      isTypeScript: true,
      isAppRouter: true,
      layoutFile: null, // skip layout patching for this test
      model: "sonnet",
      permissionsMode: "sandboxed",
    });

    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(results).toContain("anteater.config.ts");
    expect(results.some((f) => f.includes("route.ts"))).toBe(true);
    expect(results.some((f) => f.includes("anteater.yml"))).toBe(true);
    expect(results.some((f) => f.includes("settings.local.json"))).toBe(true);
  });

  it("skips files that already exist", async () => {
    // All files "exist"
    mockReadFile.mockResolvedValue("existing content");

    const results = await scaffoldFiles("/fake", {
      repo: "owner/repo",
      allowedGlobs: ["app/**"],
      blockedGlobs: [".env*"],
      autoMerge: true,
      productionBranch: "main",
      isTypeScript: true,
      isAppRouter: true,
      layoutFile: null,
    });

    // No new files created (all existed), but layout not patched since layoutFile is null
    expect(results.length).toBe(0);
  });
});
