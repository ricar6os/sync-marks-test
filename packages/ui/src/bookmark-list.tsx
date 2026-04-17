import type { BookmarkTreeNode } from "@bookmark-sync/utils"

import { BookmarkItem } from "./bookmark-item"

interface BookmarkListProps {
  items: readonly BookmarkTreeNode[]
  compact?: boolean
  selectedId?: string | null
  showActions?: boolean
  onOpen?: (node: BookmarkTreeNode) => void
  onSelect?: (node: BookmarkTreeNode) => void
}

export function BookmarkList({
  items,
  compact = false,
  selectedId,
  showActions = false,
  onOpen,
  onSelect,
}: BookmarkListProps) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <BookmarkItem
          compact={compact}
          key={item._id}
          node={item}
          onOpen={onOpen}
          onSelect={onSelect}
          selected={selectedId === item._id}
          showActions={showActions}
        />
      ))}
    </div>
  )
}
