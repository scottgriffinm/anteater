export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-16 text-sm text-muted font-mono">anteater</div>
      
      <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
        Let your users design your app.
      </h1>
      
      <p className="text-lg text-muted mb-12">
        One install. They describe changes. Your app rebuilds itself.
      </p>
      
      <div className="inline-flex items-center gap-3 rounded-lg border border-border bg-surface px-6 py-3 font-mono text-sm mb-8">
        <code>npx anteater setup</code>
      </div>
      
      <a
        href="https://github.com/sgriffin-magnoliacap/anteater"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-muted hover:text-foreground transition-colors"
      >
        GitHub
      </a>
    </section>
  );
}