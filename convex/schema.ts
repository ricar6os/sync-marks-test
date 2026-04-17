import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  ...authTables,
  bookmarks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    url: v.union(v.string(), v.null()),
    parentId: v.union(v.id("bookmarks"), v.null()),
    order: v.number(),
    type: v.union(v.literal("bookmark"), v.literal("folder")),
    updatedAt: v.number(),
    deleted: v.boolean(),
    rootKey: v.optional(
      v.union(
        v.literal("toolbar"),
        v.literal("other"),
        v.literal("mobile"),
        v.literal("menu"),
        v.literal("unfiled")
      )
    ),
  })
    .index("by_user_id", ["userId"])
    .index("by_parent_id", ["parentId"]),
})
