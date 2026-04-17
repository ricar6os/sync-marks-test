"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth } from "convex/react"
import { useRouter } from "next/navigation"
import { startTransition, useEffect, useState } from "react"

type OAuthProviderId = "google" | "github"

export function AuthForm() {
  const router = useRouter()
  const auth = useConvexAuth()
  const { signIn } = useAuthActions()

  const [error, setError] = useState<string | null>(null)
  const [pendingProvider, setPendingProvider] = useState<OAuthProviderId | null>(null)

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) {
      return
    }

    startTransition(() => {
      router.replace("/app")
      router.refresh()
    })
  }, [auth.isAuthenticated, auth.isLoading, router])

  const submit = async (provider: OAuthProviderId): Promise<void> => {
    setPendingProvider(provider)
    setError(null)

    try {
      const result = await signIn(provider, {
        redirectTo: "/app",
      })

      if (result.signingIn) {
        startTransition(() => {
          router.replace("/app")
          router.refresh()
        })
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Authentication failed")
    } finally {
      setPendingProvider(null)
    }
  }

  if (auth.isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm text-[var(--color-muted)]">
        Checking your session...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        className="action-button w-full justify-center border border-[var(--color-border)] bg-white py-3 text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pendingProvider !== null}
        onClick={() => void submit("google")}
        type="button"
      >
        {pendingProvider === "google" ? "Opening Google..." : "Continue with Google"}
      </button>
      <button
        className="action-button w-full justify-center border border-[var(--color-border)] bg-white py-3 text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pendingProvider !== null}
        onClick={() => void submit("github")}
        type="button"
      >
        {pendingProvider === "github" ? "Opening GitHub..." : "Continue with GitHub"}
      </button>
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : null}
    </div>
  )
}
