const steps = [
  {
    number: "1",
    title: "Describe",
    description: "Type a change in the Anteater bar embedded in your app.",
    detail: '"Make this button blue"',
  },
  {
    number: "2",
    title: "Agent runs",
    description:
      "A GitHub Action spins up an AI agent that edits your codebase and opens a PR.",
    detail: "PR #42 opened",
  },
  {
    number: "3",
    title: "Live in seconds",
    description:
      "The PR auto-merges (if safe) and Vercel redeploys your production site.",
    detail: "Deployed!",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-3xl sm:text-4xl font-bold tracking-tight">
          How it works
        </h2>
        <p className="mt-4 text-center text-muted max-w-xl mx-auto">
          From prompt to production in three steps. No local dev environment required.
        </p>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.number} className="relative">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="absolute top-8 left-[calc(100%+0.5rem)] hidden w-[calc(100%-1rem)] border-t border-dashed border-border md:block" />
              )}

              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface text-2xl font-bold text-accent">
                {step.number}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.description}
              </p>
              <div className="mt-3 inline-block rounded-lg bg-accent/10 px-3 py-1 font-mono text-xs text-accent">
                {step.detail}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
