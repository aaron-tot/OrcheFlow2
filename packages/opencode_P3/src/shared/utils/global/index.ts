import fs from "fs/promises"
import path from "path"
import os from "os"

const configPath = path.join(process.cwd(), "config.json")
const configFile = await Bun.file(configPath).json().catch(() => ({
  storageMacOS: { main: "~/desktop/orcheFlow_storage", buckets: {} },
  storageWindows: { main: "%USERPROFILE%\\Desktop\\orcheFlow_storage", buckets: {} },
  storageLinux: { main: "~/desktop/orcheFlow_storage", buckets: {} }
}))

const platform = process.platform === "win32" ? "storageWindows" : process.platform === "darwin" ? "storageMacOS" : "storageLinux"
const storageConfig = configFile[platform]

function resolvePath(pathStr: string): string {
  return pathStr
    .replace(/^~/, os.homedir())
    .replace(/%USERPROFILE%/g, os.homedir())
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep)
}

const mainPath = resolvePath(storageConfig.main)
const buckets = storageConfig.buckets

const data = path.join(mainPath, buckets.data?.main || "data")
const cache = path.join(mainPath, buckets.cache?.main || "cache")
const config = path.join(mainPath, buckets.config?.main || "config")
const state = path.join(mainPath, buckets.state?.main || "state")

const suffix = process.env.OPENCODE_APP_SUFFIX || "_prod"
const mode = suffix === "_dev" ? "DEV" : "PRODUCTION"

console.log(`[OpenCode] Mode: ${mode}`)
console.log(`[OpenCode] Platform: ${process.platform}`)
console.log(`[OpenCode] Data directory: ${data}`)
console.log(`[OpenCode] Cache directory: ${cache}`)
console.log(`[OpenCode] Config directory: ${config}`)
console.log(`[OpenCode] State directory: ${state}`)

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    state,
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
  fs.mkdir(path.join(Global.Path.data, "worktree"), { recursive: true }),
  fs.mkdir(path.join(Global.Path.data, "snapshot"), { recursive: true }),
  fs.mkdir(path.join(Global.Path.data, "tool-output"), { recursive: true }),
  fs.mkdir(path.join(Global.Path.data, "plans"), { recursive: true }),
  fs.mkdir(path.join(Global.Path.state, "storage"), { recursive: true }),
])

const CACHE_VERSION = "18"

const version = await Bun.file(path.join(Global.Path.cache, "version"))
  .text()
  .catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
}
