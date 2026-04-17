import type { AuthProviderId } from "@bookmark-sync/convex"
import { BookmarkList, FolderTree, SearchInput, SyncStatusBadge } from "@bookmark-sync/ui"
import { filterBookmarkTree, searchBookmarks } from "@bookmark-sync/utils"
import { useEffect, useState } from "react"

import { extensionBrowser } from "../lib/browser"
import type {
  ExtensionPushMessage,
  ExtensionRequest,
  ExtensionResponse,
  PopupState,
} from "../lib/messages"

const EMPTY_STATE: PopupState = {
  authenticated: false,
  status: "idle",
  error: null,
  lastSyncAt: null,
  bookmarks: [],
}

async function sendMessage(message: ExtensionRequest): Promise<ExtensionResponse> {
  return extensionBrowser.runtime.sendMessage(message) as Promise<ExtensionResponse>
}

export function PopupApp() {
  const [state, setState] = useState<PopupState>(EMPTY_STATE)
  const [search, setSearch] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<AuthProviderId | null>(null)

  useEffect(() => {
    void sendMessage({ type: "getState" }).then((response) => {
      setState(response.state)
      setHydrated(true)
    })

    const listener = (message: unknown): void => {
      const typedMessage = message as ExtensionPushMessage
      if (typedMessage.type === "state:update") {
        setState(typedMessage.state)
      }
    }

    extensionBrowser.runtime.onMessage.addListener(listener)
    return () => {
      extensionBrowser.runtime.onMessage.removeListener(listener)
    }
  }, [])

  const submitAuth = async (provider: AuthProviderId): Promise<void> => {
    setPendingProvider(provider)
    const response = await sendMessage({ type: "signInWithProvider", provider })
    setState(response.state)
    setPendingProvider(null)
  }

  const visibleTree = filterBookmarkTree(state.bookmarks, search)
  const searchResults = searchBookmarks(state.bookmarks, search)

  return (
    <main className="min-h-screen p-4 text-[var(--color-ink)]">
      <div className="space-y-4">
        <header className="panel flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">
              Bookmark Sync
            </p>
            <h1 className="text-lg font-semibold">Extension</h1>
            <p className="text-xs text-[var(--color-muted)]">
              {state.authenticated ? "Authenticated" : "Not signed in"}
            </p>
          </div>
          <SyncStatusBadge
            detail={state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleTimeString() : undefined}
            status={state.status}
          />
        </header>

        {!hydrated ? (
          <section className="panel space-y-3 p-4">
            <h2 className="text-sm font-semibold">Checking session</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Restoring the saved Convex Auth session for this browser profile.
            </p>
          </section>
        ) : !state.authenticated ? (
          <section className="panel space-y-4 p-4">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Sign in</h2>
              <p className="text-sm text-[var(--color-muted)]">
                Use the same Google or GitHub identity as the web app.
              </p>
            </div>
            <div className="grid gap-3">
              <button
                className="action-button w-full border border-[var(--color-border)] bg-white text-[var(--color-ink)]"
                disabled={pendingProvider !== null}
                onClick={() => void submitAuth("google")}
                type="button"
              >
                {pendingProvider === "google" ? "Opening Google..." : "Sign in with Google"}
              </button>
              <button
                className="action-button w-full border border-[var(--color-border)] bg-white text-[var(--color-ink)]"
                disabled={pendingProvider !== null}
                onClick={() => void submitAuth("github")}
                type="button"
              >
                {pendingProvider === "github" ? "Opening GitHub..." : "Sign in with GitHub"}
              </button>
            </div>
            {state.error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-[var(--color-danger)]">
                {state.error}
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="panel space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <SearchInput onChange={setSearch} value={search} />
                <button
                  className="action-button border border-[var(--color-border)] bg-white text-[var(--color-ink)]"
                  onClick={() => {
                    void sendMessage({ type: "sync" }).then((response) => setState(response.state))
                  }}
                  type="button"
                >
                  Sync
                </button>
                <button
                  className="action-button border border-[var(--color-border)] bg-white text-[var(--color-ink)]"
                  onClick={() => {
                    void sendMessage({ type: "logout" }).then((response) =>
                      setState(response.state)
                    )
                  }}
                  type="button"
                >
                  Log out
                </button>
              </div>
              {state.error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-[var(--color-danger)]">
                  {state.error}
                </div>
              ) : null}
            </section>

            <section className="panel max-h-[32rem] overflow-y-auto p-4">
              {search ? (
                <BookmarkList
                  items={searchResults}
                  onOpen={(node) => {
                    if (node.url) {
                      void extensionBrowser.tabs.create({ url: node.url })
                    }
                  }}
                />
              ) : (
                <FolderTree
                  nodes={visibleTree}
                  onOpen={(node) => {
                    if (node.url) {
                      void extensionBrowser.tabs.create({ url: node.url })
                    }
                  }}
                />
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
