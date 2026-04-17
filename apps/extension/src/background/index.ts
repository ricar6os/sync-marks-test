import type { Bookmarks } from "webextension-polyfill"

import { extensionBrowser } from "../lib/browser"
import type { ExtensionRequest } from "../lib/messages"

import { BookmarkSyncEngine } from "./sync-engine"

const engine = new BookmarkSyncEngine()

void engine.init()

extensionBrowser.runtime.onStartup.addListener(() => {
  void engine.init()
})

extensionBrowser.runtime.onInstalled.addListener(() => {
  void engine.init()
})

extensionBrowser.runtime.onMessage.addListener((message: ExtensionRequest) => {
  return engine.handleMessage(message)
})

extensionBrowser.bookmarks.onCreated.addListener((id) => {
  void engine.markLocalChange(id)
  void engine.scheduleLocalSync()
})

extensionBrowser.bookmarks.onChanged.addListener((id) => {
  void engine.markLocalChange(id)
  void engine.scheduleLocalSync()
})

extensionBrowser.bookmarks.onMoved.addListener((id) => {
  void engine.markLocalChange(id)
  void engine.scheduleLocalSync()
})

extensionBrowser.bookmarks.onRemoved.addListener((id) => {
  void engine.markLocalChange(id)
  void engine.scheduleLocalSync()
})

const maybeReordered = extensionBrowser.bookmarks as Bookmarks.Static

if ("onChildrenReordered" in maybeReordered) {
  maybeReordered.onChildrenReordered.addListener((id) => {
    void engine.markLocalChange(id)
    void engine.scheduleLocalSync()
  })
}
