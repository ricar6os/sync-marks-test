import { ConvexHttpClient } from "convex/browser"
import { ConvexReactClient, useConvexAuth } from "convex/react"
import { jwtDecode } from "jwt-decode"

import { api } from "../../../convex/_generated/api"

export type AuthProviderId = "google" | "github"

export interface StoredAuthSession {
  token: string
  refreshToken: string
  updatedAt: number
}

export interface AsyncKeyValueStore {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface OAuthSignInStart {
  redirectUrl: string
  verifier: string
}

export type AuthErrorCode =
  | "cancelled"
  | "invalid_redirect"
  | "provider_not_configured"
  | "session_expired"
  | "unknown"

export interface AuthErrorInfo {
  code: AuthErrorCode
  message: string
}

interface JwtPayload {
  exp?: number
}

const SESSION_STORAGE_KEY = "bookmark-sync-auth-session"

export class ConvexSessionManager {
  private readonly url: string
  private readonly storage: AsyncKeyValueStore
  private readonly storageKey: string
  private session: StoredAuthSession | null = null
  private hydratePromise: Promise<StoredAuthSession | null> | null = null
  private refreshPromise: Promise<string | null> | null = null

  constructor(options: { url: string; storage: AsyncKeyValueStore; storageKey?: string }) {
    this.url = options.url
    this.storage = options.storage
    this.storageKey = options.storageKey ?? SESSION_STORAGE_KEY
  }

  async hydrate(): Promise<StoredAuthSession | null> {
    if (this.session) {
      return this.session
    }

    if (!this.hydratePromise) {
      this.hydratePromise = this.storage.getItem(this.storageKey).then((raw) => {
        if (!raw) {
          return null
        }

        const parsed = JSON.parse(raw) as StoredAuthSession
        this.session = parsed
        return parsed
      })
    }

    return this.hydratePromise
  }

  getSession(): StoredAuthSession | null {
    return this.session
  }

  async startOAuthSignIn(
    provider: AuthProviderId,
    options: { redirectTo?: string } = {}
  ): Promise<OAuthSignInStart> {
    const client = new ConvexHttpClient(this.url)
    const result = await client.action(api.auth.signIn, {
      provider,
      params: options.redirectTo ? { redirectTo: options.redirectTo } : {},
    })

    if (!result.redirect || !result.verifier) {
      throw new Error(`OAuth sign-in for ${provider} did not return a redirect URL`)
    }

    return {
      redirectUrl: result.redirect,
      verifier: result.verifier,
    }
  }

  async completeOAuthCodeSignIn(args: {
    code: string
    verifier: string
  }): Promise<StoredAuthSession> {
    const client = new ConvexHttpClient(this.url)
    const result = await client.action(api.auth.signIn, {
      params: { code: args.code },
      verifier: args.verifier,
    })

    if (!result.tokens) {
      throw new Error("Authentication code exchange did not create a session")
    }

    const session = toStoredAuthSession(result.tokens)
    await this.persist(session)
    return session
  }

  async signOut(): Promise<void> {
    const session = await this.hydrate()
    if (session) {
      const client = new ConvexHttpClient(this.url, { auth: session.token })
      try {
        await client.action(api.auth.signOut, {})
      } catch {
        // Intentionally ignored to ensure local logout succeeds.
      }
    }

    await this.clearSession()
  }

  async fetchAccessToken(options: { forceRefreshToken: boolean }): Promise<string | null> {
    const session = await this.hydrate()
    if (!session) {
      return null
    }

    if (!options.forceRefreshToken && !isExpiringSoon(session.token)) {
      return session.token
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh().finally(() => {
        this.refreshPromise = null
      })
    }

    return this.refreshPromise
  }

  async clearSession(): Promise<void> {
    await this.clear()
  }

  createReactClient(onAuthChange?: (authenticated: boolean) => void): ConvexReactClient {
    const client = new ConvexReactClient(this.url)
    client.setAuth(async (args) => this.fetchAccessToken(args), onAuthChange)
    return client
  }

  private async refresh(): Promise<string | null> {
    const session = await this.hydrate()
    if (!session) {
      return null
    }

    const client = new ConvexHttpClient(this.url)
    const result = await client.action(api.auth.signIn, {
      refreshToken: session.refreshToken,
    })

    if (!result.tokens) {
      await this.clearSession()
      return null
    }

    const nextSession = toStoredAuthSession(result.tokens)

    await this.persist(nextSession)
    return nextSession.token
  }

  private async persist(session: StoredAuthSession): Promise<void> {
    this.session = session
    await this.storage.setItem(this.storageKey, JSON.stringify(session))
  }

  private async clear(): Promise<void> {
    this.session = null
    await this.storage.removeItem(this.storageKey)
  }
}

export function useAuthenticatedUserState(): {
  isAuthenticated: boolean
  isLoading: boolean
} {
  const auth = useConvexAuth()
  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
  }
}

function isExpiringSoon(token: string): boolean {
  try {
    const payload = jwtDecode<JwtPayload>(token)
    const exp = payload.exp
    if (!exp) {
      return true
    }

    return exp * 1000 < Date.now() + 60_000
  } catch {
    return true
  }
}

function toStoredAuthSession(tokens: {
  token: string
  refreshToken: string
}): StoredAuthSession {
  return {
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    updatedAt: Date.now(),
  }
}

export function normalizeAuthError(error: unknown): AuthErrorInfo {
  const message = error instanceof Error ? error.message : "Authentication failed"
  const lower = message.toLowerCase()

  if (
    lower.includes("user cancelled") ||
    lower.includes("user canceled") ||
    lower.includes("user aborted") ||
    lower.includes("authorization page could not be loaded")
  ) {
    return {
      code: "cancelled",
      message: "Sign-in was cancelled before it finished.",
    }
  }

  if (lower.includes("provider `") && lower.includes("is not configured")) {
    return {
      code: "provider_not_configured",
      message,
    }
  }

  if (
    lower.includes("redirect") ||
    lower.includes("verifier") ||
    lower.includes("code exchange") ||
    lower.includes("did not return a redirect")
  ) {
    return {
      code: "invalid_redirect",
      message,
    }
  }

  if (
    lower.includes("session") ||
    lower.includes("refresh token") ||
    lower.includes("not available")
  ) {
    return {
      code: "session_expired",
      message,
    }
  }

  return {
    code: "unknown",
    message,
  }
}
