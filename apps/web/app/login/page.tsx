import Link from "next/link"

import { AuthForm } from "@/components/auth-form"

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <section className="panel w-full space-y-6 p-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Log in</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Use the same Convex Auth identity across the web dashboard and browser extension.
          </p>
        </div>
        <AuthForm />
        <p className="text-sm text-[var(--color-muted)]">
          After signing in, you will land in the protected app and the extension can reuse the
          same user identity.{" "}
          <Link className="font-semibold text-[var(--color-accent)]" href="/app">
            Open app
          </Link>
        </p>
      </section>
    </main>
  )
}
