import {
  type AuthProviderId,
  api,
  type BookmarkSubscription,
  ConvexSessionManager,
  normalizeAuthError,
  subscribeBookmarks,
} from "@bookmark-sync/convex"
import {
  type BookmarkRootKey,
  type BookmarkTreeNode,
  type BrowserBookmarkSnapshot,
  convertBrowserTreeToSnapshots,
  createBookmarkSignature,
  flattenBookmarkTree,
  indexUniqueBySignature,
} from "@bookmark-sync/utils"
import { ConvexHttpClient } from "convex/browser"

import {
  broadcastMessage,
  extensionBrowser,
  getIdentityRedirectURL,
  launchWebAuthFlow,
} from "../lib/browser"
import { getConvexUrl } from "../lib/env"
import type {
  ExtensionPushMessage,
  ExtensionRequest,
  ExtensionResponse,
  PopupState,
} from "../lib/messages"
import { discoverLogicalRoots, resolveRootBrowserId } from "../lib/roots"
import {
  clearMappingState,
  createExtensionStorage,
  getMappingState,
  type SyncMappingState,
  saveMappingState,
} from "../lib/storage"

interface CapturedBrowserState {
  roots: Partial<Record<BookmarkRootKey, string>>
  snapshots: BrowserBookmarkSnapshot[]
}

interface RemoteSnapshot extends BookmarkTreeNode {
  rootKeyContext: BookmarkRootKey
  signature: string
}

const DEFAULT_STATE: PopupState = {
  authenticated: false,
  status: "idle",
  error: null,
  lastSyncAt: null,
  bookmarks: [],
}

export class BookmarkSyncEngine {
  private readonly sessionManager = new ConvexSessionManager({
    url: getConvexUrl(),
    storage: createExtensionStorage(),
  })
  private state: PopupState = { ...DEFAULT_STATE }
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private mapping: SyncMappingState = {
    browserToConvex: {},
    convexToBrowser: {},
    localChangeTimestamps: {},
  }
  private remoteTree: BookmarkTreeNode[] = []
  private subscription: BookmarkSubscription | null = null
  private localSyncTimer: ReturnType<typeof setTimeout> | null = null
  private applyingRemote = 0

  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        this.mapping = await getMappingState()
        const session = await this.sessionManager.hydrate()
        this.initialized = true
        if (session) {
          try {
            await this.startAuthenticated()
          } catch {
            await this.sessionManager.clearSession()
            await this.updateState({ authenticated: false, status: "idle", bookmarks: [] })
          }
        } else {
          await this.updateState({ authenticated: false, status: "idle", bookmarks: [] })
        }
      })().finally(() => {
        this.initializePromise = null
      })
    }

    await this.initializePromise
  }

  async handleMessage(message: ExtensionRequest): Promise<ExtensionResponse> {
    await this.init()

    try {
      switch (message.type) {
        case "getState":
          return { ok: true, state: this.state }
        case "signInWithProvider":
          await this.signInWithProvider(message.provider)
          await this.startAuthenticated()
          return { ok: true, state: this.state }
        case "logout":
          await this.stop()
          await this.sessionManager.signOut()
          await clearMappingState()
          this.mapping = {
            browserToConvex: {},
            convexToBrowser: {},
            localChangeTimestamps: {},
          }
          await this.updateState({
            authenticated: false,
            status: "idle",
            error: null,
            bookmarks: [],
          })
          return { ok: true, state: this.state }
        case "sync":
          await this.pushLocalChanges()
          return { ok: true, state: this.state }
      }
    } catch (caughtError) {
      const error = normalizeAuthError(caughtError).message
      await this.updateState({ error, status: "error" })
      return { ok: false, error, state: this.state }
    }
  }

  async markLocalChange(bookmarkId: string): Promise<void> {
    await this.init()
    this.mapping.localChangeTimestamps[bookmarkId] = Date.now()
    await saveMappingState(this.mapping)
  }

  async scheduleLocalSync(): Promise<void> {
    await this.init()
    if (!this.state.authenticated || this.applyingRemote > 0) {
      return
    }

    await this.updateState({ status: "syncing", error: null })
    if (this.localSyncTimer) {
      clearTimeout(this.localSyncTimer)
    }

    this.localSyncTimer = setTimeout(() => {
      void this.pushLocalChanges()
    }, 450)
  }

  private async signInWithProvider(provider: AuthProviderId): Promise<void> {
    const redirectTo = getIdentityRedirectURL()
    const { redirectUrl, verifier } = await this.sessionManager.startOAuthSignIn(provider, {
      // The extension regains control here only after Convex has completed the provider callback.
      redirectTo,
    })
    const callbackUrl = await launchWebAuthFlow({
      interactive: true,
      url: redirectUrl,
    })
    const code = extractOAuthCode(callbackUrl)
    await this.sessionManager.completeOAuthCodeSignIn({ code, verifier })
  }

  private async startAuthenticated(): Promise<void> {
    await this.stop()
    await this.updateState({ authenticated: true, status: "syncing", error: null })
    await this.bootstrap()

    const client = this.sessionManager.createReactClient((authenticated) => {
      if (!authenticated) {
        void this.handleAuthLoss()
      }
    })

    this.subscription = subscribeBookmarks(client, (tree) => {
      void this.handleRemoteUpdate(tree)
    })
  }

  private async bootstrap(): Promise<void> {
    const httpClient = await this.getHttpClient()
    const remoteTree = await httpClient.query(api.bookmarks.getBookmarksTree, {})
    this.remoteTree = remoteTree

    const remoteBookmarks = flattenBookmarkTree(remoteTree).filter((node) => !node.rootKey)
    if (remoteBookmarks.length === 0) {
      const localState = await this.captureBrowserState()
      await this.uploadLocalSnapshots(localState.snapshots, remoteTree)
      this.remoteTree = await httpClient.query(api.bookmarks.getBookmarksTree, {})
    } else {
      await this.initialMerge(remoteTree)
      await this.applyRemoteTreeToBrowser(remoteTree)
    }

    await this.updateState({
      authenticated: true,
      status: "success",
      bookmarks: this.remoteTree,
      error: null,
      lastSyncAt: Date.now(),
    })
  }

  private async initialMerge(remoteTree: BookmarkTreeNode[]): Promise<void> {
    const localState = await this.captureBrowserState()
    const remoteSnapshots = this.flattenRemoteSnapshots(remoteTree)
    const remoteById = new Map(remoteSnapshots.map((node) => [node._id, node]))
    const uniqueRemote = indexUniqueBySignature(remoteSnapshots)

    for (const local of localState.snapshots) {
      const mappedRemoteId = this.mapping.browserToConvex[local.browserId]
      if (mappedRemoteId && remoteById.has(mappedRemoteId)) {
        continue
      }

      const matchedRemote = uniqueRemote.get(local.signature)
      if (matchedRemote) {
        this.mapping.browserToConvex[local.browserId] = matchedRemote._id
        this.mapping.convexToBrowser[matchedRemote._id] = local.browserId
      }
    }

    await this.uploadLocalSnapshots(
      localState.snapshots.filter((snapshot) => !this.mapping.browserToConvex[snapshot.browserId]),
      remoteTree
    )

    await saveMappingState(this.mapping)
  }

  private async pushLocalChanges(): Promise<void> {
    if (!this.state.authenticated) {
      return
    }

    const httpClient = await this.getHttpClient()
    const remoteTree = await httpClient.query(api.bookmarks.getBookmarksTree, {})
    this.remoteTree = remoteTree
    const remoteSnapshots = this.flattenRemoteSnapshots(remoteTree)
    const remoteById = new Map(remoteSnapshots.map((node) => [node._id, node]))
    const uniqueRemote = indexUniqueBySignature(remoteSnapshots)
    const localState = await this.captureBrowserState()
    const localByBrowserId = new Map(
      localState.snapshots.map((snapshot) => [snapshot.browserId, snapshot])
    )

    for (const snapshot of localState.snapshots) {
      const matchedBySignature = uniqueRemote.get(snapshot.signature)
      if (!this.mapping.browserToConvex[snapshot.browserId] && matchedBySignature) {
        this.mapping.browserToConvex[snapshot.browserId] = matchedBySignature._id
        this.mapping.convexToBrowser[matchedBySignature._id] = snapshot.browserId
      }

      const remoteId = this.mapping.browserToConvex[snapshot.browserId]
      if (!remoteId) {
        continue
      }

      const remote = remoteById.get(remoteId)
      if (!remote) {
        delete this.mapping.browserToConvex[snapshot.browserId]
        continue
      }

      const localChangedAt = this.mapping.localChangeTimestamps[snapshot.browserId] ?? 0
      if (localChangedAt <= remote.updatedAt) {
        continue
      }

      if (remote.title !== snapshot.title || (remote.url ?? null) !== snapshot.url) {
        await httpClient.mutation(api.bookmarks.upsertBookmark, {
          _id: remote._id,
          title: snapshot.title,
          url: snapshot.type === "folder" ? null : snapshot.url,
          type: snapshot.type,
        })
      }

      const targetParentId =
        snapshot.parentBrowserId === null
          ? remoteTree.find((node) => node.rootKey === snapshot.rootKey)?._id
          : this.mapping.browserToConvex[snapshot.parentBrowserId]

      if (
        targetParentId &&
        (remote.parentId !== targetParentId || remote.order !== snapshot.order)
      ) {
        await httpClient.mutation(api.bookmarks.moveBookmark, {
          bookmarkId: remote._id,
          parentId: targetParentId,
          order: snapshot.order,
        })
      }

      delete this.mapping.localChangeTimestamps[snapshot.browserId]
    }

    for (const snapshot of localState.snapshots) {
      if (this.mapping.browserToConvex[snapshot.browserId]) {
        continue
      }

      if (!uniqueRemote.has(snapshot.signature)) {
        await this.uploadLocalSnapshot(snapshot, remoteTree, httpClient)
        delete this.mapping.localChangeTimestamps[snapshot.browserId]
      }
    }

    for (const [browserId, remoteId] of Object.entries(this.mapping.browserToConvex)) {
      if (localByBrowserId.has(browserId)) {
        continue
      }

      const remote = remoteById.get(remoteId)
      if (!remote) {
        delete this.mapping.browserToConvex[browserId]
        continue
      }

      const localChangedAt = this.mapping.localChangeTimestamps[browserId] ?? 0
      if (localChangedAt >= remote.updatedAt) {
        await httpClient.mutation(api.bookmarks.deleteBookmark, { bookmarkId: remoteId })
        delete this.mapping.localChangeTimestamps[browserId]
        delete this.mapping.browserToConvex[browserId]
        delete this.mapping.convexToBrowser[remoteId]
      }
    }

    this.remoteTree = await httpClient.query(api.bookmarks.getBookmarksTree, {})
    await saveMappingState(this.mapping)
    await this.updateState({
      status: "success",
      error: null,
      lastSyncAt: Date.now(),
      bookmarks: this.remoteTree,
    })
  }

  private async handleRemoteUpdate(tree: BookmarkTreeNode[]): Promise<void> {
    this.remoteTree = tree
    await this.updateState({
      authenticated: true,
      bookmarks: tree,
      status: "syncing",
      error: null,
    })
    await this.applyRemoteTreeToBrowser(tree)
    await this.updateState({
      authenticated: true,
      bookmarks: tree,
      status: "success",
      error: null,
      lastSyncAt: Date.now(),
    })
  }

  private async applyRemoteTreeToBrowser(remoteTree: BookmarkTreeNode[]): Promise<void> {
    this.applyingRemote += 1

    try {
      const browserState = await this.captureBrowserState()
      const localById = new Map(
        browserState.snapshots.map((snapshot) => [snapshot.browserId, snapshot])
      )
      const usedBrowserIds = new Set<string>()

      for (const root of remoteTree) {
        const parentBrowserId = resolveRootBrowserId(
          root.rootKey ?? "toolbar",
          this.asRootMap(browserState)
        )
        if (!parentBrowserId) {
          continue
        }

        await this.syncRemoteChildren(
          root.children,
          root.rootKey ?? "toolbar",
          parentBrowserId,
          localById,
          usedBrowserIds
        )
      }

      const liveRemoteIds = new Set(
        this.flattenRemoteSnapshots(remoteTree).map((snapshot) => snapshot._id)
      )

      for (const [remoteId, browserId] of Object.entries(this.mapping.convexToBrowser)) {
        if (liveRemoteIds.has(remoteId)) {
          continue
        }

        const local = localById.get(browserId)
        if (!local) {
          delete this.mapping.convexToBrowser[remoteId]
          delete this.mapping.browserToConvex[browserId]
          delete this.mapping.localChangeTimestamps[browserId]
          continue
        }

        await this.removeLocalNode(local)
        delete this.mapping.convexToBrowser[remoteId]
        delete this.mapping.browserToConvex[browserId]
        delete this.mapping.localChangeTimestamps[browserId]
      }

      await saveMappingState(this.mapping)
    } finally {
      this.applyingRemote -= 1
    }
  }

  private async syncRemoteChildren(
    children: readonly BookmarkTreeNode[],
    rootKey: BookmarkRootKey,
    parentBrowserId: string,
    localById: Map<string, BrowserBookmarkSnapshot>,
    usedBrowserIds: Set<string>
  ): Promise<void> {
    const localUnique = indexUniqueBySignature(
      localById.values().toArray?.() ?? Array.from(localById.values())
    )

    for (const [index, child] of children.entries()) {
      let browserId = this.mapping.convexToBrowser[child._id]
      let local = browserId ? localById.get(browserId) : undefined

      if (!local) {
        const signature = this.createRemoteSignature(child, rootKey)
        const matched = localUnique.get(signature)
        if (matched) {
          browserId = matched.browserId
          local = matched
          this.mapping.convexToBrowser[child._id] = matched.browserId
          this.mapping.browserToConvex[matched.browserId] = child._id
        }
      }

      if (local) {
        usedBrowserIds.add(local.browserId)
        const changedAt = this.mapping.localChangeTimestamps[local.browserId] ?? 0
        if (changedAt <= child.updatedAt) {
          if (local.parentBrowserId !== parentBrowserId || local.order !== index) {
            await extensionBrowser.bookmarks.move(local.browserId, {
              parentId: parentBrowserId,
              index,
            })
          }

          if (local.title !== child.title || (local.url ?? null) !== child.url) {
            await extensionBrowser.bookmarks.update(local.browserId, {
              title: child.title,
              ...(child.type === "bookmark" && child.url ? { url: child.url } : {}),
            })
          }
        }

        browserId = local.browserId
      } else {
        const created = await extensionBrowser.bookmarks.create({
          parentId: parentBrowserId,
          index,
          title: child.title,
          ...(child.type === "bookmark" && child.url ? { url: child.url } : {}),
        })
        browserId = created.id
        this.mapping.convexToBrowser[child._id] = browserId
        this.mapping.browserToConvex[browserId] = child._id
      }

      if (child.children.length > 0) {
        await this.syncRemoteChildren(child.children, rootKey, browserId, localById, usedBrowserIds)
      }
    }
  }

  private async uploadLocalSnapshots(
    snapshots: readonly BrowserBookmarkSnapshot[],
    remoteTree: readonly BookmarkTreeNode[]
  ): Promise<void> {
    const httpClient = await this.getHttpClient()
    const sorted = [...snapshots].sort((left, right) =>
      left.parentBrowserId === null && right.parentBrowserId !== null
        ? -1
        : left.parentBrowserId !== null && right.parentBrowserId === null
          ? 1
          : left.order - right.order
    )

    for (const snapshot of sorted) {
      await this.uploadLocalSnapshot(snapshot, remoteTree, httpClient)
    }

    await saveMappingState(this.mapping)
  }

  private async uploadLocalSnapshot(
    snapshot: BrowserBookmarkSnapshot,
    remoteTree: readonly BookmarkTreeNode[],
    httpClient: ConvexHttpClient
  ): Promise<void> {
    const parentId =
      snapshot.parentBrowserId === null
        ? remoteTree.find((node) => node.rootKey === snapshot.rootKey)?._id
        : this.mapping.browserToConvex[snapshot.parentBrowserId]

    if (!parentId) {
      return
    }

    const createdId = await httpClient.mutation(api.bookmarks.upsertBookmark, {
      title: snapshot.title,
      url: snapshot.type === "folder" ? null : snapshot.url,
      parentId,
      order: snapshot.order,
      type: snapshot.type,
    })

    this.mapping.browserToConvex[snapshot.browserId] = createdId
    this.mapping.convexToBrowser[createdId] = snapshot.browserId
  }

  private flattenRemoteSnapshots(nodes: readonly BookmarkTreeNode[]): RemoteSnapshot[] {
    const flattened: RemoteSnapshot[] = []

    const visit = (node: BookmarkTreeNode, rootKey: BookmarkRootKey, path: string[]): void => {
      if (!node.rootKey) {
        flattened.push({
          ...node,
          rootKeyContext: rootKey,
          signature: createBookmarkSignature({
            type: node.type,
            title: node.title,
            url: node.url,
            rootKey,
            path,
          }),
        })
      }

      const nextPath = node.type === "folder" && !node.rootKey ? [...path, node.title] : path
      for (const child of node.children) {
        visit(child, rootKey, nextPath)
      }
    }

    for (const root of nodes) {
      if (!root.rootKey) {
        continue
      }

      for (const child of root.children) {
        visit(child, root.rootKey, [root.rootKey])
      }
    }

    return flattened
  }

  private createRemoteSignature(node: BookmarkTreeNode, rootKey: BookmarkRootKey): string {
    return createBookmarkSignature({
      type: node.type,
      title: node.title,
      url: node.url,
      rootKey,
      path: [rootKey],
    })
  }

  private async captureBrowserState(): Promise<CapturedBrowserState> {
    const tree = await extensionBrowser.bookmarks.getTree()
    const roots = discoverLogicalRoots(tree)
    const observedAt = Date.now()
    const snapshots: BrowserBookmarkSnapshot[] = []

    for (const [key, root] of Object.entries(roots) as Array<
      [
        BookmarkRootKey,
        { children: BrowserBookmarkSnapshot[] | unknown[]; browserId: string } & {
          children: unknown[]
        },
      ]
    >) {
      snapshots.push(
        ...convertBrowserTreeToSnapshots({
          rootKey: key,
          nodes: root.children as never[],
          observedAt,
        })
      )
    }

    return {
      roots: Object.fromEntries(
        Object.entries(roots).map(([key, root]) => [key, root.browserId])
      ) as Partial<Record<BookmarkRootKey, string>>,
      snapshots,
    }
  }

  private asRootMap(
    state: CapturedBrowserState
  ): Partial<Record<BookmarkRootKey, { browserId: string }>> {
    return Object.fromEntries(
      Object.entries(state.roots).map(([key, browserId]) => [key, { browserId }])
    ) as Partial<Record<BookmarkRootKey, { browserId: string }>>
  }

  private async removeLocalNode(node: BrowserBookmarkSnapshot): Promise<void> {
    if (node.type === "folder") {
      await extensionBrowser.bookmarks.removeTree(node.browserId)
    } else {
      await extensionBrowser.bookmarks.remove(node.browserId)
    }
  }

  private async getHttpClient(): Promise<ConvexHttpClient> {
    const token = await this.sessionManager.fetchAccessToken({ forceRefreshToken: false })
    if (!token) {
      throw new Error("Extension session is not available")
    }

    return new ConvexHttpClient(getConvexUrl(), { auth: token })
  }

  private async stop(): Promise<void> {
    if (this.subscription) {
      this.subscription.unsubscribe()
      this.subscription = null
    }

    if (this.localSyncTimer) {
      clearTimeout(this.localSyncTimer)
      this.localSyncTimer = null
    }
  }

  private async handleAuthLoss(): Promise<void> {
    await this.stop()
    await this.sessionManager.clearSession()
    await this.updateState({ authenticated: false, status: "idle", error: null, bookmarks: [] })
  }

  private async updateState(nextState: Partial<PopupState>): Promise<void> {
    this.state = {
      ...this.state,
      ...nextState,
    }

    const message: ExtensionPushMessage = {
      type: "state:update",
      state: this.state,
    }
    await broadcastMessage(message)
  }
}

function extractOAuthCode(redirectUrl: string): string {
  const url = new URL(redirectUrl)
  const code = url.searchParams.get("code")
  if (!code) {
    throw new Error("OAuth redirect did not include a valid code.")
  }

  return code
}
