export type BookmarkType = "bookmark" | "folder"

export type BookmarkRootKey = "toolbar" | "other" | "mobile" | "menu" | "unfiled"

export interface BookmarkNode {
  _id: string
  userId: string
  title: string
  url: string | null
  parentId: string | null
  order: number
  type: BookmarkType
  updatedAt: number
  deleted: boolean
  rootKey?: BookmarkRootKey | null
}

export interface BookmarkTreeNode extends BookmarkNode {
  children: BookmarkTreeNode[]
}

export interface BrowserBookmarkTreeNodeLike {
  id: string
  title: string
  url?: string
  children?: BrowserBookmarkTreeNodeLike[]
}

export interface BrowserBookmarkSnapshot {
  browserId: string
  title: string
  url: string | null
  parentBrowserId: string | null
  order: number
  type: BookmarkType
  rootKey: BookmarkRootKey
  updatedAt: number
  signature: string
}

export const LOGICAL_ROOT_KEYS: BookmarkRootKey[] = [
  "toolbar",
  "other",
  "mobile",
  "menu",
  "unfiled",
]

export function normalizeBookmarkTitle(title: string | null | undefined): string {
  return (title ?? "").trim()
}

export function normalizeBookmarkUrl(url: string | null | undefined): string | null {
  const value = url?.trim()
  return value ? value : null
}

export function stableSort<T>(items: readonly T[], compare: (left: T, right: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const result = compare(left.item, right.item)
      return result !== 0 ? result : left.index - right.index
    })
    .map(({ item }) => item)
}

export function compareBookmarks(
  left: Pick<BookmarkNode, "order" | "title" | "updatedAt">,
  right: Pick<BookmarkNode, "order" | "title" | "updatedAt">
): number {
  if (left.order !== right.order) {
    return left.order - right.order
  }

  const titleComparison = left.title.localeCompare(right.title)
  if (titleComparison !== 0) {
    return titleComparison
  }

  return left.updatedAt - right.updatedAt
}

export function buildBookmarkTree(nodes: readonly BookmarkNode[]): BookmarkTreeNode[] {
  const nodeMap = new Map<string, BookmarkTreeNode>()
  const roots: BookmarkTreeNode[] = []

  for (const node of stableSort(nodes, compareBookmarks)) {
    nodeMap.set(node._id, { ...node, children: [] })
  }

  for (const node of stableSort(nodes, compareBookmarks)) {
    const treeNode = nodeMap.get(node._id)
    if (!treeNode) {
      continue
    }

    if (!node.parentId) {
      roots.push(treeNode)
      continue
    }

    const parent = nodeMap.get(node.parentId)
    if (!parent) {
      roots.push(treeNode)
      continue
    }

    parent.children.push(treeNode)
  }

  return roots
}

export function flattenBookmarkTree(nodes: readonly BookmarkTreeNode[]): BookmarkTreeNode[] {
  const flattened: BookmarkTreeNode[] = []

  const visit = (node: BookmarkTreeNode): void => {
    flattened.push(node)
    for (const child of node.children) {
      visit(child)
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return flattened
}

export function filterBookmarkTree(
  nodes: readonly BookmarkTreeNode[],
  rawQuery: string
): BookmarkTreeNode[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) {
    return [...nodes]
  }

  const matches = (node: BookmarkTreeNode): boolean => {
    const title = node.title.toLowerCase()
    const url = node.url?.toLowerCase() ?? ""
    return title.includes(query) || url.includes(query)
  }

  const visit = (node: BookmarkTreeNode): BookmarkTreeNode | null => {
    const children = node.children
      .map((child) => visit(child))
      .filter((child): child is BookmarkTreeNode => child !== null)

    if (matches(node) || children.length > 0) {
      return { ...node, children }
    }

    return null
  }

  return nodes.map((node) => visit(node)).filter((node): node is BookmarkTreeNode => node !== null)
}

export function searchBookmarks(
  nodes: readonly BookmarkTreeNode[],
  rawQuery: string
): BookmarkTreeNode[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) {
    return flattenBookmarkTree(nodes)
  }

  return flattenBookmarkTree(nodes).filter((node) => {
    const title = node.title.toLowerCase()
    const url = node.url?.toLowerCase() ?? ""
    return title.includes(query) || url.includes(query)
  })
}

export function createBookmarkSignature(input: {
  type: BookmarkType
  title: string
  url: string | null
  rootKey: BookmarkRootKey
  path: readonly string[]
}): string {
  return [
    input.rootKey,
    input.type,
    normalizeBookmarkTitle(input.title).toLowerCase(),
    normalizeBookmarkUrl(input.url)?.toLowerCase() ?? "",
    input.path.map((segment) => normalizeBookmarkTitle(segment).toLowerCase()).join("/"),
  ].join("|")
}

export function indexUniqueBySignature<T extends { signature: string }>(
  items: readonly T[]
): Map<string, T> {
  const grouped = new Map<string, T[]>()

  for (const item of items) {
    const current = grouped.get(item.signature) ?? []
    current.push(item)
    grouped.set(item.signature, current)
  }

  const unique = new Map<string, T>()
  for (const [signature, group] of grouped.entries()) {
    if (group.length === 1) {
      const onlyItem = group[0]
      if (onlyItem) {
        unique.set(signature, onlyItem)
      }
    }
  }
  return unique
}

export function convertBrowserTreeToSnapshots(input: {
  rootKey: BookmarkRootKey
  nodes: readonly BrowserBookmarkTreeNodeLike[]
  observedAt: number
}): BrowserBookmarkSnapshot[] {
  const snapshots: BrowserBookmarkSnapshot[] = []

  const visit = (
    node: BrowserBookmarkTreeNodeLike,
    parentBrowserId: string | null,
    order: number,
    path: string[]
  ): void => {
    const type: BookmarkType = node.url ? "bookmark" : "folder"
    const nextPath = type === "folder" ? [...path, node.title] : path
    const snapshot: BrowserBookmarkSnapshot = {
      browserId: node.id,
      title: normalizeBookmarkTitle(node.title),
      url: normalizeBookmarkUrl(node.url),
      parentBrowserId,
      order,
      type,
      rootKey: input.rootKey,
      updatedAt: input.observedAt,
      signature: createBookmarkSignature({
        type,
        title: node.title,
        url: normalizeBookmarkUrl(node.url),
        rootKey: input.rootKey,
        path,
      }),
    }

    snapshots.push(snapshot)

    if (!node.children?.length) {
      return
    }

    stableSort(
      node.children.map((child, childIndex) => ({ child, childIndex })),
      (left, right) => left.childIndex - right.childIndex
    ).forEach(({ child, childIndex }) => {
      visit(child, node.id, childIndex, nextPath)
    })
  }

  input.nodes.forEach((node, order) => {
    visit(node, null, order, [input.rootKey])
  })

  return snapshots
}

export function nowTimestamp(): number {
  return Date.now()
}
