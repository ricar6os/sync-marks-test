import type { BookmarkRootKey, BrowserBookmarkTreeNodeLike } from "@bookmark-sync/utils"

import { LOGICAL_ROOT_KEYS } from "@bookmark-sync/utils"
import type browser from "webextension-polyfill"

export interface LogicalRoot {
  key: BookmarkRootKey
  browserId: string
  title: string
  children: BrowserBookmarkTreeNodeLike[]
}

function inferRootKey(
  node: browser.Bookmarks.BookmarkTreeNode,
  fallbackIndex: number
): BookmarkRootKey | null {
  const id = node.id.toLowerCase()
  const title = node.title.toLowerCase()

  if (id === "1" || id.includes("toolbar")) {
    return "toolbar"
  }
  if (id === "2" || title.includes("other")) {
    return "other"
  }
  if (id === "3" || id.includes("mobile") || title.includes("mobile")) {
    return "mobile"
  }
  if (id.includes("menu") || title.includes("menu")) {
    return "menu"
  }
  if (id.includes("unfiled") || title.includes("unfiled") || title.includes("unsorted")) {
    return "unfiled"
  }

  return LOGICAL_ROOT_KEYS[fallbackIndex] ?? null
}

export function discoverLogicalRoots(
  tree: browser.Bookmarks.BookmarkTreeNode[]
): Partial<Record<BookmarkRootKey, LogicalRoot>> {
  const root = tree[0]
  if (!root?.children) {
    return {}
  }

  const mapped: Partial<Record<BookmarkRootKey, LogicalRoot>> = {}
  root.children.forEach((child, index) => {
    const key = inferRootKey(child, index)
    if (!key) {
      return
    }

    mapped[key] = {
      key,
      browserId: child.id,
      title: child.title,
      children: child.children ?? [],
    }
  })

  return mapped
}

export function resolveRootBrowserId(
  key: BookmarkRootKey,
  roots: Partial<Record<BookmarkRootKey, LogicalRoot>>
): string | null {
  return (
    roots[key]?.browserId ??
    roots.other?.browserId ??
    roots.toolbar?.browserId ??
    roots.mobile?.browserId ??
    null
  )
}
