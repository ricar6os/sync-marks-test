"use client"

import {
  api,
  collectParentOptions,
  filterClientBookmarkTree,
  searchClientBookmarks,
} from "@bookmark-sync/convex"
import { BookmarkList, FolderTree, SearchInput, SyncStatusBadge } from "@bookmark-sync/ui"
import type { BookmarkTreeNode } from "@bookmark-sync/utils"
import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import { startTransition, useEffect, useMemo, useState } from "react"

function clampOrder(rawValue: string, fallback: number): number {
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function DashboardClient() {
  const router = useRouter()
  const { signOut } = useAuthActions()

  const bookmarks = useQuery(api.bookmarks.getBookmarksTree, {})
  const upsertBookmark = useMutation(api.bookmarks.upsertBookmark)
  const moveBookmark = useMutation(api.bookmarks.moveBookmark)
  const deleteBookmark = useMutation(api.bookmarks.deleteBookmark)

  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createType, setCreateType] = useState<"bookmark" | "folder">("bookmark")
  const [createTitle, setCreateTitle] = useState("")
  const [createUrl, setCreateUrl] = useState("")
  const [createParentId, setCreateParentId] = useState("")
  const [renameTitle, setRenameTitle] = useState("")
  const [renameUrl, setRenameUrl] = useState("")
  const [moveParentId, setMoveParentId] = useState("")
  const [moveOrder, setMoveOrder] = useState("0")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tree = bookmarks ?? []
  const visibleTree = useMemo(() => filterClientBookmarkTree(tree, search), [tree, search])
  const searchResults = useMemo(() => searchClientBookmarks(tree, search), [tree, search])

  const selectedNode = useMemo(() => {
    const lookup = (nodes: readonly BookmarkTreeNode[]): BookmarkTreeNode | null => {
      for (const node of nodes) {
        if (node._id === selectedId) {
          return node
        }
        const child = lookup(node.children)
        if (child) {
          return child
        }
      }

      return null
    }

    return selectedId ? lookup(tree) : (tree[0] ?? null)
  }, [selectedId, tree])

  const parentOptions = useMemo(
    () => collectParentOptions(tree, selectedNode?._id).filter((node) => node.type === "folder"),
    [selectedNode?._id, tree]
  )

  useEffect(() => {
    if (!selectedNode && tree.length > 0) {
      const firstNode = tree[0]
      if (firstNode) {
        setSelectedId(firstNode._id)
      }
    }
  }, [selectedNode, tree])

  useEffect(() => {
    if (!selectedNode) {
      return
    }

    setRenameTitle(selectedNode.title)
    setRenameUrl(selectedNode.url ?? "")
    setMoveParentId(selectedNode.parentId ?? parentOptions[0]?._id ?? "")
    setMoveOrder(String(selectedNode.order))
    if (!createParentId) {
      setCreateParentId(
        selectedNode.type === "folder" ? selectedNode._id : (selectedNode.parentId ?? "")
      )
    }
  }, [createParentId, parentOptions, selectedNode])

  const submitCreate = async (): Promise<void> => {
    if (!createParentId) {
      setError("Choose a parent folder before creating a bookmark.")
      return
    }

    setBusy(true)
    setError(null)
    try {
      await upsertBookmark({
        title: createTitle.trim(),
        url: createType === "folder" ? null : createUrl.trim(),
        parentId: createParentId,
        order:
          parentOptions.find((node) => node._id === createParentId)?.children.length ?? undefined,
        type: createType,
      })
      setCreateTitle("")
      setCreateUrl("")
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Create failed")
    } finally {
      setBusy(false)
    }
  }

  const submitRename = async (): Promise<void> => {
    if (!selectedNode) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      await upsertBookmark({
        _id: selectedNode._id,
        title: renameTitle.trim(),
        url: selectedNode.type === "folder" ? null : renameUrl.trim(),
        type: selectedNode.type,
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const submitMove = async (): Promise<void> => {
    if (!selectedNode || !moveParentId) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      await moveBookmark({
        bookmarkId: selectedNode._id,
        parentId: moveParentId,
        order: clampOrder(moveOrder, selectedNode.order),
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Move failed")
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async (): Promise<void> => {
    if (!selectedNode || selectedNode.rootKey) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      await deleteBookmark({ bookmarkId: selectedNode._id })
      setSelectedId(null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    await signOut()
    startTransition(() => {
      router.replace("/login")
      router.refresh()
    })
  }

  const defaultParentId =
    (selectedNode?.type === "folder" ? selectedNode._id : selectedNode?.parentId) ??
    parentOptions[0]?._id ??
    ""

  useEffect(() => {
    if (!createParentId && defaultParentId) {
      setCreateParentId(defaultParentId)
    }
  }, [createParentId, defaultParentId])

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-8">
      <header className="panel flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--color-muted)]">Dashboard</p>
          <h1 className="text-3xl font-semibold">Your live bookmark tree</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncStatusBadge
            status={bookmarks ? "success" : "idle"}
            detail={bookmarks ? "Realtime" : "Loading"}
          />
          <button
            className="action-button border border-[var(--color-border)] bg-white text-[var(--color-ink)]"
            onClick={() => void logout()}
            type="button"
          >
            Log out
          </button>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="panel space-y-4 p-6">
          <SearchInput onChange={setSearch} value={search} />
          {search ? (
            <BookmarkList
              items={searchResults}
              onOpen={(node) => {
                if (node.url) {
                  window.open(node.url, "_blank", "noopener,noreferrer")
                }
              }}
              onSelect={(node) => setSelectedId(node._id)}
              selectedId={selectedId}
            />
          ) : (
            <FolderTree
              nodes={visibleTree}
              onCreateChild={(node, type) => {
                setCreateParentId(node._id)
                setCreateType(type)
                setSelectedId(node._id)
              }}
              onDelete={(node) => {
                setSelectedId(node._id)
                void submitDelete()
              }}
              onOpen={(node) => {
                if (node.url) {
                  window.open(node.url, "_blank", "noopener,noreferrer")
                }
              }}
              onRename={(node) => setSelectedId(node._id)}
              onSelect={(node) => setSelectedId(node._id)}
              selectedId={selectedId}
            />
          )}
        </div>

        <aside className="space-y-6">
          <section className="panel space-y-4 p-6">
            <h2 className="text-lg font-semibold">Create bookmark</h2>
            <div className="grid gap-3">
              <select
                className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                onChange={(event) => setCreateType(event.target.value as "bookmark" | "folder")}
                value={createType}
              >
                <option value="bookmark">Bookmark</option>
                <option value="folder">Folder</option>
              </select>
              <input
                className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Title"
                value={createTitle}
              />
              {createType === "bookmark" ? (
                <input
                  className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                  onChange={(event) => setCreateUrl(event.target.value)}
                  placeholder="https://example.com"
                  value={createUrl}
                />
              ) : null}
              <select
                className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                onChange={(event) => setCreateParentId(event.target.value)}
                value={createParentId || defaultParentId}
              >
                <option value="">Choose parent folder</option>
                {parentOptions.map((node) => (
                  <option key={node._id} value={node._id}>
                    {node.title}
                  </option>
                ))}
              </select>
              <button
                className="action-button w-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
                disabled={
                  busy || !createTitle.trim() || (createType === "bookmark" && !createUrl.trim())
                }
                onClick={() => void submitCreate()}
                type="button"
              >
                Create
              </button>
            </div>
          </section>

          <section className="panel space-y-4 p-6">
            <h2 className="text-lg font-semibold">Selected bookmark</h2>
            {selectedNode ? (
              <div className="space-y-4">
                <input
                  className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                  disabled={Boolean(selectedNode.rootKey)}
                  onChange={(event) => setRenameTitle(event.target.value)}
                  value={renameTitle}
                />
                {selectedNode.type === "bookmark" ? (
                  <input
                    className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                    disabled={Boolean(selectedNode.rootKey)}
                    onChange={(event) => setRenameUrl(event.target.value)}
                    value={renameUrl}
                  />
                ) : null}
                <button
                  className="action-button w-full border border-[var(--color-border)] bg-white text-[var(--color-ink)] disabled:opacity-60"
                  disabled={busy || Boolean(selectedNode.rootKey)}
                  onClick={() => void submitRename()}
                  type="button"
                >
                  Save details
                </button>

                {!selectedNode.rootKey ? (
                  <div className="space-y-3 rounded-3xl bg-[var(--color-panel)] p-4">
                    <p className="text-sm font-semibold">Move</p>
                    <select
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                      onChange={(event) => setMoveParentId(event.target.value)}
                      value={moveParentId}
                    >
                      {parentOptions.map((node) => (
                        <option key={node._id} value={node._id}>
                          {node.title}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3"
                      inputMode="numeric"
                      onChange={(event) => setMoveOrder(event.target.value)}
                      value={moveOrder}
                    />
                    <button
                      className="action-button w-full bg-white text-[var(--color-ink)]"
                      disabled={busy || !moveParentId}
                      onClick={() => void submitMove()}
                      type="button"
                    >
                      Move item
                    </button>
                    <button
                      className="action-button w-full bg-rose-50 text-[var(--color-danger)]"
                      disabled={busy}
                      onClick={() => void submitDelete()}
                      type="button"
                    >
                      Soft delete
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Logical root folders are fixed so cross-browser roots stay aligned.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Choose a bookmark or folder to edit it.
              </p>
            )}
            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-[var(--color-danger)]">
                {error}
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  )
}
