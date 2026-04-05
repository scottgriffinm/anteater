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
  generateApplyScript,
  patchLayout,
  scaffoldFiles,
} = await import("../../packages/setup-anteater/lib/scaffold.mjs");

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
    });
    expect(result).toContain("workflow_dispatch");
    expect(result).toContain("timeout-minutes: 10");
    expect(result).toContain("actions/checkout@v4");
    expect(result).toContain("node-version: 22");
  });

  it("embeds allowed and blocked globs", () => {
    const result = generateWorkflow({
      allowedGlobs: ["src/**"],
      blockedGlobs: [".env*"],
      productionBranch: "main",
    });
    expect(result).toContain("--allowed-paths");
    expect(result).toContain("src/**");
    expect(result).toContain("--blocked-paths");
    expect(result).toContain(".env*");
  });

  it("includes auto-merge step", () => {
    const result = generateWorkflow({
      allowedGlobs: ["app/**"],
      blockedGlobs: [],
      productionBranch: "main",
    });
    expect(result).toContain("gh pr merge");
    expect(result).toContain("--squash");
    expect(result).toContain("--delete-branch");
  });
});

describe("generateApplyScript", () => {
  it("generates script with correct AI model", () => {
    const result = generateApplyScript();
    expect(result).toContain("claude-sonnet-4-20250514");
  });

  it("includes max_tokens limit", () => {
    const result = generateApplyScript();
    expect(result).toContain("max_tokens: 16384");
  });

  it("includes truncation guard", () => {
    const result = generateApplyScript();
    expect(result).toContain("max_tokens exceeded");
  });

  it("includes path validation with basename fallback", () => {
    const result = generateApplyScript();
    expect(result).toContain("basename");
    expect(result).toContain("Corrected:");
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
    expect(written).toContain('import { AnteaterBar } from "@anteater/next"');
    expect(written).toContain("<AnteaterBar />");
    // AnteaterBar should be before </body>
    const barIdx = written.indexOf("<AnteaterBar />");
    const bodyIdx = written.indexOf("</body>");
    expect(barIdx).toBeLessThan(bodyIdx);
  });

  it("is idempotent — skips if already patched", async () => {
    mockReadFile.mockResolvedValue(`import { AnteaterBar } from "@anteater/next";
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
    });

    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(results).toContain("anteater.config.ts");
    expect(results.some((f) => f.includes("route.ts"))).toBe(true);
    expect(results.some((f) => f.includes("anteater.yml"))).toBe(true);
    expect(results.some((f) => f.includes("apply-changes.mjs"))).toBe(true);
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
