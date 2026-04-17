import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(currentDirectory, "../..")

for (const fileName of [".env.local", ".env"]) {
  const envFilePath = path.join(workspaceRoot, fileName)
  if (fs.existsSync(envFilePath)) {
    process.loadEnvFile(envFilePath)
  }
}

if (!process.env.NEXT_PUBLIC_CONVEX_URL && process.env.CONVEX_URL) {
  process.env.NEXT_PUBLIC_CONVEX_URL = process.env.CONVEX_URL
}

const nextConfig: NextConfig = {
  transpilePackages: [
    "@bookmark-sync/config",
    "@bookmark-sync/convex",
    "@bookmark-sync/ui",
    "@bookmark-sync/utils",
  ],
}

export default nextConfig
