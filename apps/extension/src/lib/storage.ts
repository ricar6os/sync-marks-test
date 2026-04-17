import type { AsyncKeyValueStore } from "@bookmark-sync/convex"

import { extensionBrowser } from "./browser"

export interface SyncMappingState {
  browserToConvex: Record<string, string>
  convexToBrowser: Record<string, string>
  localChangeTimestamps: Record<string, number>
}

const SESSION_PREFIX = "bookmark-sync"
const MAPPING_KEY = `${SESSION_PREFIX}:mapping`

const EMPTY_MAPPING_STATE: SyncMappingState = {
  browserToConvex: {},
  convexToBrowser: {},
  localChangeTimestamps: {},
}

export function createExtensionStorage(namespace = SESSION_PREFIX): AsyncKeyValueStore {
  return {
    async getItem(key) {
      const value = await extensionBrowser.storage.local.get(`${namespace}:${key}`)
      const raw = value[`${namespace}:${key}`]
      return typeof raw === "string" ? raw : null
    },
    async setItem(key, value) {
      await extensionBrowser.storage.local.set({ [`${namespace}:${key}`]: value })
    },
    async removeItem(key) {
      await extensionBrowser.storage.local.remove(`${namespace}:${key}`)
    },
  }
}

export async function getMappingState(): Promise<SyncMappingState> {
  const data = await extensionBrowser.storage.local.get(MAPPING_KEY)
  const value = data[MAPPING_KEY]
  if (!value || typeof value !== "object") {
    return { ...EMPTY_MAPPING_STATE }
  }

  const parsed = value as SyncMappingState
  return {
    browserToConvex: parsed.browserToConvex ?? {},
    convexToBrowser: parsed.convexToBrowser ?? {},
    localChangeTimestamps: parsed.localChangeTimestamps ?? {},
  }
}

export async function saveMappingState(state: SyncMappingState): Promise<void> {
  await extensionBrowser.storage.local.set({
    [MAPPING_KEY]: state,
  })
}

export async function clearMappingState(): Promise<void> {
  await extensionBrowser.storage.local.remove(MAPPING_KEY)
}
