import type { AuthProviderId } from "@bookmark-sync/convex"
import type { SyncStatus } from "@bookmark-sync/ui"
import type { BookmarkTreeNode } from "@bookmark-sync/utils"

export interface PopupState {
  authenticated: boolean
  status: SyncStatus
  error: string | null
  lastSyncAt: number | null
  bookmarks: BookmarkTreeNode[]
}

export type ExtensionRequest =
  | { type: "getState" }
  | { type: "signInWithProvider"; provider: AuthProviderId }
  | { type: "logout" }
  | { type: "sync" }

export type ExtensionResponse =
  | { ok: true; state: PopupState }
  | { ok: false; error: string; state: PopupState }

export type ExtensionPushMessage = { type: "state:update"; state: PopupState }
