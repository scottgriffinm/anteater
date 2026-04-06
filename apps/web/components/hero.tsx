const REPO = "scottgriffinm/anteater";

export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <img src="/anteater.svg" alt="Anteater" className="w-32 h-auto mb-10" />
      <div className="mb-16 text-sm text-muted font-mono">anteater</div>

      <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
        Let users design your app.
      </h1>

      <p className="text-lg text-muted mb-8">
        One install - then let users make the changes they need.
      </p>

      <p className="text-xs text-muted mb-4 uppercase tracking-widest">Currently supports</p>
      <div className="flex items-center gap-6 mb-12 text-muted">
        <div className="flex flex-col items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z" />
          </svg>
          <span className="text-xs">Next.js</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="m12 1.608 12 20.784H0Z" />
          </svg>
          <span className="text-xs">Vercel</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z" />
          </svg>
          <span className="text-xs">Supabase</span>
        </div>
      </div>

      <div className="inline-flex items-center gap-3 rounded-lg border border-border bg-surface px-6 py-3 font-mono text-sm mb-8">
        <code>npx anteater setup</code>
      </div>

      <a
        href={`https://github.com/${REPO}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        GitHub
      </a>
    </section>
  );
}
