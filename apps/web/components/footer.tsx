export function Footer() {
  return (
    <footer className="mt-auto border-t border-border px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
        <div className="flex items-center gap-2">
          <span aria-hidden>&#x1f41c;</span>
          <span>Anteater</span>
          <span className="text-border">&middot;</span>
          <span>MIT License</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/sgriffin-magnoliacap/anteater"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
