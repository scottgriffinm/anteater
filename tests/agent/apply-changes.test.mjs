import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";

let tempDir;
let originalFetch;
let originalDir;
let originalArgv;
let originalEnv;

beforeEach(async () => {
  tempDir = await mkdtemp(join(os.tmpdir(), "anteater-test-"));
  originalFetch = globalThis.fetch;
  originalDir = process.cwd();
  originalArgv = process.argv;
  originalEnv = { ...process.env };

  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  // chdir so fs.readFile resolves relative paths correctly
  process.chdir(tempDir);
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(originalDir);
  process.argv = originalArgv;
  process.env = originalEnv;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function createFixture(relativePath, content) {
  const fullPath = join(tempDir, relativePath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

function mockAnthropicResponse(changes) {
  return async (url) => {
    if (url.includes("api.anthropic.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: JSON.stringify(changes) }],
          usage: { input_tokens: 100, output_tokens: 50 },
          stop_reason: "end_turn",
        }),
      };
    }
    return { ok: false, status: 404 };
  };
}

async function importFresh(argv) {
  process.argv = ["node", "apply-changes.mjs", ...argv];
  vi.resetModules();
  return import("../../.github/scripts/apply-changes.mjs");
}

describe("apply-changes agent", () => {
  it("collects files matching allowed globs and excludes blocked", async () => {
    await createFixture("app/page.tsx", "export default function() {}");
    await createFixture("app/api/route.ts", "export function GET() {}");
    await createFixture("components/hero.tsx", "export function Hero() {}");
    await createFixture("node_modules/pkg/index.js", "module.exports = {}");

    globalThis.fetch = mockAnthropicResponse([]);
    const mod = await importFresh(["--prompt", "test", "--allowed-paths", "app/**,components/**", "--blocked-paths", "app/api/**"]);

    const files = await mod.collectFiles();
    expect(files).toContain("app/page.tsx");
    expect(files).toContain("components/hero.tsx");
    expect(files).not.toContain("app/api/route.ts");
    expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
  });

  it("callClaude sends correct request shape", async () => {
    let capturedBody;
    globalThis.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "[]" }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: "end_turn",
        }),
      };
    };

    const mod = await importFresh(["--prompt", "test change", "--allowed-paths", "app/**", "--blocked-paths", ""]);
    await mod.callClaude("test change", { "app/page.tsx": "content here" });

    expect(capturedBody.model).toBe("claude-sonnet-4-20250514");
    expect(capturedBody.max_tokens).toBe(16384);
    expect(capturedBody.system).toContain("Anteater");
    expect(capturedBody.messages[0].content).toContain("test change");
    expect(capturedBody.messages[0].content).toContain("app/page.tsx");
  });

  it("callClaude throws on max_tokens truncation", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "partial..." }],
        stop_reason: "max_tokens",
      }),
    });

    const mod = await importFresh(["--prompt", "test", "--allowed-paths", "app/**", "--blocked-paths", ""]);
    await expect(mod.callClaude("test", { "app/page.tsx": "content" }))
      .rejects.toThrow("max_tokens exceeded");
  });

  it("callClaude throws on API error", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const mod = await importFresh(["--prompt", "test", "--allowed-paths", "app/**", "--blocked-paths", ""]);
    await expect(mod.callClaude("test", { "app/page.tsx": "content" }))
      .rejects.toThrow("Anthropic API error 401");
  });

  it("validates paths and rejects unknown files", async () => {
    await createFixture("components/hero.tsx", "<h1>Original</h1>");
    await createFixture("app/page.tsx", "<Page />");

    globalThis.fetch = mockAnthropicResponse([
      { path: "components/hero.tsx", content: "<h1>Modified</h1>" },
      { path: "malicious/file.tsx", content: "evil code" },
    ]);

    const mod = await importFresh(["--prompt", "modify hero", "--allowed-paths", "components/**,app/**", "--blocked-paths", ""]);
    await mod.main();

    const heroContent = await readFile(join(tempDir, "components/hero.tsx"), "utf-8");
    expect(heroContent).toBe("<h1>Modified</h1>");

    await expect(readFile(join(tempDir, "malicious/file.tsx"), "utf-8")).rejects.toThrow();
  });

  it("corrects basename-only path matches", async () => {
    await createFixture("apps/web/components/hero.tsx", "<h1>Original</h1>");

    globalThis.fetch = mockAnthropicResponse([
      { path: "components/hero.tsx", content: "<h1>Corrected</h1>" },
    ]);

    const mod = await importFresh(["--prompt", "fix hero", "--allowed-paths", "apps/web/components/**", "--blocked-paths", ""]);
    await mod.main();

    const heroContent = await readFile(join(tempDir, "apps/web/components/hero.tsx"), "utf-8");
    expect(heroContent).toBe("<h1>Corrected</h1>");
  });

  it("handles empty Claude response gracefully", async () => {
    await createFixture("components/hero.tsx", "<h1>Untouched</h1>");

    globalThis.fetch = mockAnthropicResponse([]);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit-0");
    });

    const mod = await importFresh(["--prompt", "do nothing", "--allowed-paths", "components/**", "--blocked-paths", ""]);
    await expect(mod.main()).rejects.toThrow("exit-0");
    exitSpy.mockRestore();

    const content = await readFile(join(tempDir, "components/hero.tsx"), "utf-8");
    expect(content).toBe("<h1>Untouched</h1>");
  });
});
