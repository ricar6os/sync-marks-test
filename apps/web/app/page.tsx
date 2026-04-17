import Link from "next/link"

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-6 py-16">
      <div className="inline-flex w-fit items-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
        Convex-native bookmark sync
      </div>
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[var(--color-ink)] md:text-7xl">
            One live bookmark tree for the web app and your browser extension.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[var(--color-muted)]">
            Sign in once, sync browser bookmark changes into Convex in real time, and manage the
            same hierarchy from a clean dashboard.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              className="action-button bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)]"
              href="/login"
            >
              Log in
            </Link>
            <Link
              className="action-button border border-[var(--color-border)] bg-white text-[var(--color-ink)]"
              href="/app"
            >
              Open app
            </Link>
          </div>
        </section>

        <section className="panel space-y-5 p-6">
          <h2 className="text-lg font-semibold">What ships in this repo</h2>
          <ul className="space-y-3 text-sm leading-7 text-[var(--color-muted)]">
            <li>Convex Auth with Google and GitHub sign-in on web and extension.</li>
            <li>Realtime bookmark tree updates in the dashboard.</li>
            <li>Background sync from browser bookmark events into Convex.</li>
            <li>Client-side search, move, rename, and soft delete flows.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
