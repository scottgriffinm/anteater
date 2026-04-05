export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center px-6 pt-32 pb-20 text-center">
      {/* Beta badge */}
      <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
        <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        Now in public beta
      </div>

      <h1 className="max-w-3xl text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.08]">
        Ship changes in{" "}
        <span className="text-accent">seconds.</span>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          View on GitHub
        </a>
        <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-mono text-muted">
          <span className="text-accent">$</span>
          <code>npx create-anteater init</code>
        </div>
      </div>

      {/* Demo visual */}
      <div className="mt-16 w-full max-w-2xl rounded-2xl border border-border bg-surface p-1">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="ml-2 text-xs text-muted font-mono">anteater</span>
        </div>
        <div className="p-6 font-mono text-sm leading-relaxed text-left">
          <div className="text-muted">
            <span className="text-accent">&gt;</span> Make the hero headline larger and add a gradient
          </div>
          <div className="mt-4 text-muted/60">
            <span className="text-yellow-500">anteater</span> Dispatching to GitHub Actions...
          </div>
          <div className="mt-1 text-muted/60">
            <span className="text-yellow-500">anteater</span> Agent editing components/hero.tsx...
          </div>
          <div className="mt-1 text-muted/60">
            <span className="text-accent">anteater</span> PR #42 opened &rarr; auto-merging...
          </div>
          <div className="mt-1 text-accent">
            <span className="text-accent">anteater</span> Deployed! Changes live in 38s.
          </div>
        </div>
      </div>
    </section>
  );
}