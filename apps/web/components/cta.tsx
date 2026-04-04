export function CTA() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-10 text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Add Anteater to your app
        </h2>
        <p className="mt-4 text-muted">
          One command. Your Next.js app becomes self-modifiable.
        </p>

        <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 px-6 py-3.5 font-mono text-sm">
          <span className="text-accent">$</span>
          <code className="text-foreground">npx create-anteater init</code>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/sgriffin-magnoliacap/anteater"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-black hover:bg-accent-muted transition-colors"
          >
            Get started
          </a>
          <a
            href="https://github.com/sgriffin-magnoliacap/anteater"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-muted hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            Read the docs
          </a>
        </div>
      </div>
    </section>
  );
}
