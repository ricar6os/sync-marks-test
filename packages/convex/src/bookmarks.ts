import {
  type BookmarkNode,
  type BookmarkRootKey,
  type BookmarkTreeNode,
  type BookmarkType,
  buildBookmarkTree,
  filterBookmarkTree,
  flattenBookmarkTree,
  searchBookmarks,
} from "@bookmark-sync/utils"
import type { ConvexReactClient } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api } from "../../../convex/_generated/api"

export type { BookmarkNode, BookmarkRootKey, BookmarkTreeNode, BookmarkType }

export type BookmarksTreeResult = FunctionReturnType<typeof api.bookmarks.getBookmarksTree>

export interface BookmarkSubscription {
  getCurrentValue: () => BookmarksTreeResult | undefined
  unsubscribe: () => void
}

export function subscribeBookmarks(
  client: ConvexReactClient,
  onUpdate: (value: BookmarksTreeResult) => void
): BookmarkSubscription {
  const watch = client.watchQuery(api.bookmarks.getBookmarksTree, {})

  const emit = (): void => {
    const value = watch.localQueryResult()
    if (value) {
      onUpdate(value)
    }
  }

  const unsubscribe = watch.onUpdate(emit)
  emit()

  return {
    getCurrentValue: () => watch.localQueryResult(),
    unsubscribe,
  }
}

export function buildClientBookmarkTree(nodes: readonly BookmarkNode[]): BookmarkTreeNode[] {
  return buildBookmarkTree(nodes)
}

export function flattenClientBookmarkTree(nodes: readonly BookmarkTreeNode[]): BookmarkTreeNode[] {
  return flattenBookmarkTree(nodes)
}

export function filterClientBookmarkTree(
  nodes: readonly BookmarkTreeNode[],
  query: string
): BookmarkTreeNode[] {
  return filterBookmarkTree(nodes, query)
}

export function searchClientBookmarks(
  nodes: readonly BookmarkTreeNode[],
  query: string
): BookmarkTreeNode[] {
  return searchBookmarks(nodes, query)
}

export function collectParentOptions(
  nodes: readonly BookmarkTreeNode[],
  currentId?: string
): BookmarkTreeNode[] {
  const flattened = flattenBookmarkTree(nodes)
  if (!currentId) {
    return flattened.filter((node) => node.type === "folder")
  }

  const descendants = new Set<string>()
  const collect = (node: BookmarkTreeNode): void => {
    descendants.add(node._id)
    for (const child of node.children) {
      collect(child)
    }
  }

  const current = flattened.find((node) => node._id === currentId)
  if (current) {
    collect(current)
  }

  return flattened.filter((node) => node.type === "folder" && !descendants.has(node._id))
}
