import type { BookmarkNode, BookmarkRootKey } from "../../packages/utils/src/index"
import { buildBookmarkTree, compareBookmarks, stableSort } from "../../packages/utils/src/index"

import type { Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

import { ROOT_DEFINITIONS, ROOT_ORDER } from "./constants"

type BookmarkId = Id<"bookmarks">
type UserId = Id<"users">

export function toBookmarkId(id: string): BookmarkId {
  return id as BookmarkId
}

export function toBookmarkNode(doc: {
  _id: BookmarkId
  userId: UserId
  title: string
  url: string | null
  parentId: BookmarkId | null
  order: number
  type: "bookmark" | "folder"
  updatedAt: number
  deleted: boolean
  rootKey?: BookmarkRootKey
}): BookmarkNode {
  return {
    _id: doc._id,
    userId: doc.userId,
    title: doc.title,
    url: doc.url,
    parentId: doc.parentId,
    order: doc.order,
    type: doc.type,
    updatedAt: doc.updatedAt,
    deleted: doc.deleted,
    rootKey: doc.rootKey ?? null,
  }
}

export async function ensureUserRoots(ctx: MutationCtx, userId: UserId): Promise<void> {
  const existing = await ctx.db
    .query("bookmarks")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .collect()

  const existingKeys = new Set(
    existing
      .filter((doc) => !doc.deleted && doc.rootKey)
      .map((doc) => doc.rootKey as BookmarkRootKey)
  )

  for (const definition of ROOT_DEFINITIONS) {
    if (existingKeys.has(definition.key)) {
      continue
    }

    await ctx.db.insert("bookmarks", {
      userId,
      title: definition.title,
      url: null,
      parentId: null,
      order: ROOT_ORDER[definition.key],
      type: "folder",
      updatedAt: Date.now(),
      deleted: false,
      rootKey: definition.key,
    })
  }
}

export async function getUserBookmarks(
  ctx: QueryCtx | MutationCtx,
  userId: UserId
): Promise<ReturnType<typeof toBookmarkNode>[]> {
  const documents = await ctx.db
    .query("bookmarks")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .collect()

  return stableSort(
    documents.filter((doc) => !doc.deleted).map((doc) => toBookmarkNode(doc)),
    compareBookmarks
  )
}

export async function getOwnedBookmark(
  ctx: QueryCtx | MutationCtx,
  bookmarkId: BookmarkId,
  userId: UserId
): Promise<{
  _id: BookmarkId
  userId: UserId
  title: string
  url: string | null
  parentId: BookmarkId | null
  order: number
  type: "bookmark" | "folder"
  updatedAt: number
  deleted: boolean
  rootKey?: BookmarkRootKey
}> {
  const bookmark = await ctx.db.get(bookmarkId)
  if (!bookmark || bookmark.deleted || bookmark.userId !== userId) {
    throw new Error("Bookmark not found")
  }

  return bookmark
}

export async function getOwnedFolder(
  ctx: QueryCtx | MutationCtx,
  bookmarkId: BookmarkId,
  userId: UserId
): Promise<{
  _id: BookmarkId
  userId: UserId
  title: string
  url: string | null
  parentId: BookmarkId | null
  order: number
  type: "bookmark" | "folder"
  updatedAt: number
  deleted: boolean
  rootKey?: BookmarkRootKey
}> {
  const bookmark = await getOwnedBookmark(ctx, bookmarkId, userId)
  if (bookmark.type !== "folder") {
    throw new Error("Parent must be a folder")
  }

  return bookmark
}

export async function listChildren(
  ctx: QueryCtx | MutationCtx,
  userId: UserId,
  parentId: BookmarkId | null
): Promise<
  Array<{
    _id: BookmarkId
    userId: UserId
    title: string
    url: string | null
    parentId: BookmarkId | null
    order: number
    type: "bookmark" | "folder"
    updatedAt: number
    deleted: boolean
    rootKey?: BookmarkRootKey
  }>
> {
  const documents =
    parentId === null
      ? await ctx.db
          .query("bookmarks")
          .withIndex("by_user_id", (query) => query.eq("userId", userId))
          .collect()
      : await ctx.db
          .query("bookmarks")
          .withIndex("by_parent_id", (query) => query.eq("parentId", parentId))
          .collect()

  return stableSort(
    documents.filter((doc) => !doc.deleted && doc.userId === userId && doc.parentId === parentId),
    compareBookmarks
  )
}

export async function reorderChildren(
  ctx: MutationCtx,
  userId: UserId,
  parentId: BookmarkId | null,
  orderedIds: readonly BookmarkId[]
): Promise<void> {
  const siblings = await listChildren(ctx, userId, parentId)
  const siblingMap = new Map(siblings.map((doc) => [doc._id, doc]))

  for (const [index, bookmarkId] of orderedIds.entries()) {
    const bookmark = siblingMap.get(bookmarkId)
    if (!bookmark) {
      continue
    }

    if (bookmark.order !== index) {
      await ctx.db.patch(bookmarkId, { order: index })
    }
  }
}

export function buildTreeFromBookmarks(nodes: readonly BookmarkNode[]) {
  return buildBookmarkTree(nodes)
}
