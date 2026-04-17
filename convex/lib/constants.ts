import type { BookmarkRootKey } from "../../packages/utils/src/index"

export const ROOT_ORDER: Record<BookmarkRootKey, number> = {
  toolbar: 0,
  other: 1,
  menu: 2,
  unfiled: 3,
  mobile: 4,
}

export const ROOT_DEFINITIONS: Array<{ key: BookmarkRootKey; title: string }> = [
  { key: "toolbar", title: "Bookmarks Bar" },
  { key: "other", title: "Other Bookmarks" },
  { key: "menu", title: "Bookmarks Menu" },
  { key: "unfiled", title: "Unfiled Bookmarks" },
  { key: "mobile", title: "Mobile Bookmarks" },
]
