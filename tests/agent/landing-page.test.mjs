/**
 * E2E Test: AI agent modifies the landing page hero component.
 *
 * Uses REAL filesystem in a temp directory. Only the Anthropic API is mocked.
 * Tests the full pipeline: file discovery -> reading -> API call -> path validation -> file writing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import os from "node:os";

const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures");

// The modified hero that "Claude" returns — changes headline to "Ship faster."
const MODIFIED_HERO = `export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center px-6 pt-32 pb-20 text-center">
      {/* Beta badge */}
      <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
        <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        Now in public beta
      </div>

      <h1 className="max-w-3xl text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08]">
        Ship faster.
      </h1>

      <p className="mt-6 max-w-xl text-lg text-muted leading-relaxed">
        Describe changes in plain English. Anteater handles the rest.
      </p>

      <div className="mt-10 flex flex-col sm:flex-row gap-4">
        <a
          href="https://github.com/sgriffin-magnoliacap/anteater"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-black hover:bg-accent-muted transition-colors"
        >
          View on GitHub
        </a>
        <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-mono text-muted">
          <span className="text-accent">$</span>
          <code>npx create-anteater init</code>
        </div>
      </div>
    </section>
  );
}`;

let tempDir;
let originalFetch;
let originalDir;
let originalArgv;
let originalEnv;

beforeEach(async () => {
  tempDir = await mkdtemp(join(os.tmpdir(), "anteater-e2e-"));
  originalFetch = globalThis.fetch;
  originalDir = process.cwd();
  originalArgv = process.argv;
  originalEnv = { ...process.env };

  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  process.chdir(tempDir);
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(originalDir);
  process.argv = originalArgv;
  process.env = originalEnv;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function setupFixtures() {
  await mkdir(join(tempDir, "apps/web/components"), { recursive: true });
  await mkdir(join(tempDir, "apps/web/app"), { recursive: true });

  await copyFile(join(FIXTURES_DIR, "hero.tsx"), join(tempDir, "apps/web/components/hero.tsx"));
  await copyFile(join(FIXTURES_DIR, "page.tsx"), join(tempDir, "apps/web/app/page.tsx"));
}

function mockClaude(changes) {
  globalThis.fetch = async (url) => {
    if (!url.includes("api.anthropic.com")) {
      return { ok: false, status: 404, text: async () => "not found" };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(changes) }],
        usage: { input_tokens: 500, output_tokens: 200 },
        stop_reason: "end_turn",
      }),
    };
  };
}

async function runAgent(prompt) {
  process.argv = [
    "node", "apply-changes.mjs",
    "--prompt", prompt,
    "--allowed-paths", "apps/web/components/**,apps/web/app/**",
    "--blocked-paths", "apps/web/app/api/**",
  ];

  vi.resetModules();
  return import("../../.github/scripts/apply-changes.mjs");
}

describe("landing page E2E", () => {
  it("agent modifies hero headline based on prompt", async () => {
    await setupFixtures();

    mockClaude([
      { path: "apps/web/components/hero.tsx", content: MODIFIED_HERO },
    ]);

    const mod = await runAgent("Change the hero headline to Ship faster.");
    await mod.main();

    const heroContent = await readFile(join(tempDir, "apps/web/components/hero.tsx"), "utf-8");

    expect(heroContent).toContain("Ship faster.");
    expect(heroContent).not.toContain("Your app rewrites");
    expect(heroContent).toContain("export function Hero()");
    expect(heroContent).toContain("return (");
    expect(heroContent).toContain("</section>");
  });

  it("agent does not modify files not in Claude response", async () => {
    await setupFixtures();
    const originalPage = await readFile(join(tempDir, "apps/web/app/page.tsx"), "utf-8");

    mockClaude([
      { path: "apps/web/components/hero.tsx", content: MODIFIED_HERO },
    ]);

    const mod = await runAgent("Change the hero headline to Ship faster.");
    await mod.main();

    const pageContent = await readFile(join(tempDir, "apps/web/app/page.tsx"), "utf-8");
    expect(pageContent).toBe(originalPage);
  });

  it("handles empty response — no files changed", async () => {
    await setupFixtures();
    const originalHero = await readFile(join(tempDir, "apps/web/components/hero.tsx"), "utf-8");

    mockClaude([]);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit-0");
    });

    const mod = await runAgent("Do nothing please");
    await expect(mod.main()).rejects.toThrow("exit-0");
    exitSpy.mockRestore();

    const heroContent = await readFile(join(tempDir, "apps/web/components/hero.tsx"), "utf-8");
    expect(heroContent).toBe(originalHero);
  });

  it("corrects shortened path from Claude", async () => {
    await setupFixtures();

    // Claude returns shortened path (missing apps/web/ prefix)
    mockClaude([
      { path: "components/hero.tsx", content: MODIFIED_HERO },
    ]);

    const mod = await runAgent("Change the hero headline");
    await mod.main();

    const heroContent = await readFile(join(tempDir, "apps/web/components/hero.tsx"), "utf-8");
    expect(heroContent).toContain("Ship faster.");
  });
});
