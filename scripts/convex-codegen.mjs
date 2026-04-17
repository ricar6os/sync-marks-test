import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const result = spawnSync("pnpm", ["exec", "convex", "codegen"], {
  stdio: "inherit",
  shell: process.platform === "win32",
})

if (result.status === 0) {
  process.exit(0)
}

const generatedFilesExist =
  existsSync("./convex/_generated/api.ts") &&
  existsSync("./convex/_generated/dataModel.ts") &&
  existsSync("./convex/_generated/server.ts")

if (!generatedFilesExist) {
  process.exit(result.status ?? 1)
}

console.warn(
  "Convex codegen skipped because the deployment is not configured. Using committed generated files instead."
)
