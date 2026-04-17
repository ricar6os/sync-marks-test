import { v } from "convex/values"

import type { BookmarkNode, BookmarkTreeNode } from "../packages/utils/src/index"
import { nowTimestamp } from "../packages/utils/src/index"
import type { Id } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import {
  buildTreeFromBookmarks,
  getOwnedBookmark,
  getOwnedFolder,
  getUserBookmarks,
  listChildren,
  reorderChildren,
  toBookmarkId,
} from "./lib/bookmarks"

async function loadUserTreeDocuments(
  ctx: Parameters<typeof getUserBookmarks>[0],
  userId: Id<"users">
) {
  const bookmarks = await getUserBookmarks(ctx, userId as never)
  return bookmarks
}

export const getBookmarksTree = query({
  args: {},
  handler: async (ctx): Promise<BookmarkTreeNode[]> => {
    const userId = await requireUserId(ctx)
    const bookmarks = await loadUserTreeDocuments(ctx, userId)
    return buildTreeFromBookmarks(bookmarks)
  },
})

export const upsertBookmark = mutation({
  args: {
    _id: v.optional(v.string()),
    title: v.string(),
    url: v.union(v.string(), v.null()),
    parentId: v.optional(v.string()),
    order: v.optional(v.number()),
    type: v.union(v.literal("bookmark"), v.literal("folder")),
  },
  handler: async (ctx, args): Promise<string> => {
    const userId = await requireUserId(ctx)
    const timestamp = nowTimestamp()

    if (args._id) {
      const bookmarkId = toBookmarkId(args._id)
      const existing = await getOwnedBookmark(ctx, bookmarkId, userId as never)
      if (existing.rootKey) {
        throw new Error("Logical root folders cannot be modified")
      }

      await ctx.db.patch(bookmarkId, {
        title: args.title.trim(),
        url: args.type === "folder" ? null : args.url,
        updatedAt: timestamp,
      })

      return args._id
    }

    if (!args.parentId) {
      throw new Error("New bookmarks require a parent folder")
    }

    const parentId = toBookmarkId(args.parentId)
    await getOwnedFolder(ctx, parentId, userId as never)

    const siblings = await listChildren(ctx, userId as never, parentId)
    const insertionIndex = Math.max(0, Math.min(args.order ?? siblings.length, siblings.length))

    const insertedId = await ctx.db.insert("bookmarks", {
      userId: userId as never,
      title: args.title.trim(),
      url: args.type === "folder" ? null : args.url,
      parentId,
      order: insertionIndex,
      type: args.type,
      updatedAt: timestamp,
      deleted: false,
    })

    const orderedIds = siblings.map((sibling) => sibling._id)
    orderedIds.splice(insertionIndex, 0, insertedId)
    await reorderChildren(ctx, userId as never, parentId, orderedIds)

    return insertedId
  },
})

export const moveBookmark = mutation({
  args: {
    bookmarkId: v.string(),
    parentId: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const userId = await requireUserId(ctx)
    const bookmarkId = toBookmarkId(args.bookmarkId)
    const parentId = toBookmarkId(args.parentId)
    const timestamp = nowTimestamp()

    const bookmark = await getOwnedBookmark(ctx, bookmarkId, userId as never)
    if (bookmark.rootKey) {
      throw new Error("Logical root folders cannot be moved")
    }

    await getOwnedFolder(ctx, parentId, userId as never)

    const allBookmarks = await loadUserTreeDocuments(ctx, userId)
    const childrenByParent = new Map<string | null, BookmarkNode[]>()
    for (const node of allBookmarks) {
      const current = childrenByParent.get(node.parentId) ?? []
      current.push(node)
      childrenByParent.set(node.parentId, current)
    }

    const descendants = new Set<string>()
    const collect = (currentId: string): void => {
      descendants.add(currentId)
      const children = childrenByParent.get(currentId) ?? []
      for (const child of children) {
        collect(child._id)
      }
    }
    collect(bookmark._id)

    if (descendants.has(args.parentId)) {
      throw new Error("A bookmark cannot be moved into its own subtree")
    }

    const targetSiblings = (await listChildren(ctx, userId as never, parentId)).filter(
      (sibling) => sibling._id !== bookmarkId
    )
    const insertionIndex = Math.max(0, Math.min(args.order, targetSiblings.length))
    const targetIds = targetSiblings.map((sibling) => sibling._id)
    targetIds.splice(insertionIndex, 0, bookmarkId)

    await ctx.db.patch(bookmarkId, {
      parentId,
      order: insertionIndex,
      updatedAt: timestamp,
    })
    await reorderChildren(ctx, userId as never, parentId, targetIds)

    if (bookmark.parentId !== parentId) {
      const previousSiblings = (await listChildren(ctx, userId as never, bookmark.parentId)).filter(
        (sibling) => sibling._id !== bookmarkId
      )
      await reorderChildren(
        ctx,
        userId as never,
        bookmark.parentId,
        previousSiblings.map((sibling) => sibling._id)
      )
    }
  },
})

export const deleteBookmark = mutation({
  args: {
    bookmarkId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const userId = await requireUserId(ctx)
    const bookmarkId = toBookmarkId(args.bookmarkId)
    const timestamp = nowTimestamp()

    const bookmark = await getOwnedBookmark(ctx, bookmarkId, userId as never)
    if (bookmark.rootKey) {
      throw new Error("Logical root folders cannot be deleted")
    }

    const bookmarks = await loadUserTreeDocuments(ctx, userId)
    const childrenByParent = new Map<string | null, BookmarkNode[]>()
    for (const node of bookmarks) {
      const children = childrenByParent.get(node.parentId) ?? []
      children.push(node)
      childrenByParent.set(node.parentId, children)
    }

    const toDelete: string[] = []
    const visit = (currentId: string): void => {
      toDelete.push(currentId)
      for (const child of childrenByParent.get(currentId) ?? []) {
        visit(child._id)
      }
    }
    visit(bookmark._id)

    for (const id of toDelete) {
      await ctx.db.patch(toBookmarkId(id), {
        deleted: true,
        updatedAt: timestamp,
      })
    }

    const siblings = (await listChildren(ctx, userId as never, bookmark.parentId)).filter(
      (sibling) => sibling._id !== bookmarkId
    )
    await reorderChildren(
      ctx,
      userId as never,
      bookmark.parentId,
      siblings.map((sibling) => sibling._id)
    )
  },
})
