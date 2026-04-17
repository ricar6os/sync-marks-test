import fs from "node:fs"
import path from "node:path"
import react from "@vitejs/plugin-react"
import type { Plugin } from "vite"
import { defineConfig, loadEnv } from "vite"

type BrowserTarget = "chromium" | "firefox"

function manifestPlugin(target: BrowserTarget, convexUrl: string): Plugin {
  return {
    name: "manifest-plugin",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist", target)
      const hostPermissions = [
        convexUrl ? `${new URL(convexUrl).origin}/*` : "https://*.convex.cloud/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
      ]

      const manifest =
        target === "firefox"
          ? {
              manifest_version: 3,
              name: "Bookmark Sync",
              version: "0.0.0",
              description: "Cross-browser bookmark sync powered by Convex.",
              permissions: ["bookmarks", "identity", "storage"],
              host_permissions: hostPermissions,
              action: {
                default_title: "Bookmark Sync",
                default_popup: "popup.html",
              },
              background: {
                scripts: ["assets/background.js"],
                type: "module",
              },
              browser_specific_settings: {
                gecko: {
                  id: "bookmark-sync@example.com",
                },
              },
            }
          : {
              manifest_version: 3,
              name: "Bookmark Sync",
              version: "0.0.0",
              description: "Cross-browser bookmark sync powered by Convex.",
              permissions: ["bookmarks", "identity", "storage"],
              host_permissions: hostPermissions,
              action: {
                default_title: "Bookmark Sync",
                default_popup: "popup.html",
              },
              background: {
                service_worker: "assets/background.js",
                type: "module",
              },
            }

      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))
    },
  }
}

export default defineConfig(({ mode }) => {
  const target = (process.env.BROWSER_TARGET ?? "chromium") as BrowserTarget
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "")
  const convexUrl = env.VITE_CONVEX_URL || env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210"

  return {
    plugins: [react(), manifestPlugin(target, convexUrl)],
    define: {
      __BOOKMARK_SYNC_CONVEX_URL__: JSON.stringify(convexUrl),
    },
    build: {
      outDir: path.resolve(__dirname, "dist", target),
      emptyOutDir: true,
      sourcemap: mode === "development",
      rollupOptions: {
        input: {
          popup: path.resolve(__dirname, "popup.html"),
          background: path.resolve(__dirname, "src/background/index.ts"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  }
})
