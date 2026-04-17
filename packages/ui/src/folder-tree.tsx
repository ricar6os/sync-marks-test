import type { BookmarkTreeNode } from "@bookmark-sync/utils"
import { useState } from "react"

import { BookmarkItem } from "./bookmark-item"

interface FolderTreeProps {
  nodes: readonly BookmarkTreeNode[]
  selectedId?: string | null
  onCreateChild?: (node: BookmarkTreeNode, type: "bookmark" | "folder") => void
  onDelete?: (node: BookmarkTreeNode) => void
  onOpen?: (node: BookmarkTreeNode) => void
  onRename?: (node: BookmarkTreeNode) => void
  onSelect?: (node: BookmarkTreeNode) => void
}

export function FolderTree({
  nodes,
  selectedId,
  onCreateChild,
  onDelete,
  onOpen,
  onRename,
  onSelect,
}: FolderTreeProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (id: string): void => {
    setCollapsed((current) => ({
      ...current,
      [id]: !current[id],
    }))
  }

  const renderNode = (node: BookmarkTreeNode, depth: number) => {
    const isCollapsed = collapsed[node._id] ?? false

    return (
      <div className="space-y-2" key={node._id}>
        <div className="flex items-center gap-2">
          {node.type === "folder" ? (
            <button
              className="h-7 w-7 shrink-0 rounded-full border border-[var(--color-border)] bg-white/80 text-xs"
              onClick={() => toggle(node._id)}
              type="button"
            >
              {isCollapsed ? "+" : "−"}
            </button>
          ) : (
            <span className="h-7 w-7 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <BookmarkItem
              depth={depth}
              node={node}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onOpen={onOpen}
              onRename={onRename}
              onSelect={onSelect}
              selected={selectedId === node._id}
            />
          </div>
        </div>
        {node.children.length > 0 && !isCollapsed ? (
          <div className="space-y-2">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    )
  }

  return <div className="space-y-3">{nodes.map((node) => renderNode(node, 0))}</div>
}
