import type { BookmarkTreeNode } from "@bookmark-sync/utils"

interface BookmarkItemProps {
  node: BookmarkTreeNode
  depth?: number
  selected?: boolean
  compact?: boolean
  showActions?: boolean
  onSelect?: (node: BookmarkTreeNode) => void
  onRename?: (node: BookmarkTreeNode) => void
  onDelete?: (node: BookmarkTreeNode) => void
  onCreateChild?: (node: BookmarkTreeNode, type: "bookmark" | "folder") => void
  onOpen?: (node: BookmarkTreeNode) => void
}

export function BookmarkItem({
  node,
  depth = 0,
  selected = false,
  compact = false,
  showActions = true,
  onCreateChild,
  onDelete,
  onOpen,
  onRename,
  onSelect,
}: BookmarkItemProps) {
  return (
    <div
      className={[
        "group flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 transition-colors",
        selected
          ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,white)]"
          : "border-transparent bg-white/70 hover:border-[var(--color-border)] hover:bg-white",
      ].join(" ")}
      style={{ paddingLeft: compact ? undefined : `${0.75 + depth * 1}rem` }}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => onSelect?.(node)}
        type="button"
      >
        <span className="text-lg">{node.type === "folder" ? "📁" : "🔖"}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{node.title || "Untitled"}</span>
          {node.url ? (
            <span className="block truncate text-xs text-[var(--color-muted)]">{node.url}</span>
          ) : null}
        </span>
      </button>

      {showActions ? (
        <div className="flex shrink-0 items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          {node.type === "bookmark" && onOpen ? (
            <button
              className="action-button bg-[var(--color-panel)] text-xs text-[var(--color-ink)]"
              onClick={() => onOpen(node)}
              type="button"
            >
              Open
            </button>
          ) : null}
          {node.type === "folder" && onCreateChild ? (
            <>
              <button
                className="action-button bg-[var(--color-panel)] text-xs text-[var(--color-ink)]"
                onClick={() => onCreateChild(node, "bookmark")}
                type="button"
              >
                + Link
              </button>
              <button
                className="action-button bg-[var(--color-panel)] text-xs text-[var(--color-ink)]"
                onClick={() => onCreateChild(node, "folder")}
                type="button"
              >
                + Folder
              </button>
            </>
          ) : null}
          {onRename ? (
            <button
              className="action-button bg-[var(--color-panel)] text-xs text-[var(--color-ink)]"
              onClick={() => onRename(node)}
              type="button"
            >
              Rename
            </button>
          ) : null}
          {onDelete && !node.rootKey ? (
            <button
              className="action-button bg-rose-50 text-xs text-[var(--color-danger)]"
              onClick={() => onDelete(node)}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
