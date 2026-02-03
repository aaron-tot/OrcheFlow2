import { spawn } from "child_process"
import path from "path"
import { readableStreamToText } from "bun"
import { Filesystem } from "../../../shared/utils/filesystem"
import { Instance } from "../../../core/instance"
import { BunProc } from "../../runtime/bun"
import { LSPServer } from "../server-core"

/**
 * Linter Language Servers
 * Purpose: Oxlint, Biome servers
 */

export const Oxlint: LSPServer.Info = {
  id: "oxlint",
  root: LSPServer.NearestRoot([
    ".oxlintrc.json",
    "package-lock.json",
    "bun.lockb",
    "bun.lock",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package.json",
  ]),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".astro", ".svelte"],
  async spawn(root) {
    const ext = process.platform === "win32" ? ".cmd" : ""

    const serverTarget = path.join("node_modules", ".bin", "oxc_language_server" + ext)
    const lintTarget = path.join("node_modules", ".bin", "oxlint" + ext)

    const resolveBin = async (target: string) => {
      const localBin = path.join(root, target)
      if (await Bun.file(localBin).exists()) return localBin

      const candidates = Filesystem.up({
        targets: [target],
        start: root,
        stop: Instance.worktree,
      })
      const first = await candidates.next()
      await candidates.return()
      if (first.value) return first.value

      return undefined
    }

    let lintBin = await resolveBin(lintTarget)
    if (!lintBin) {
      const found = Bun.which("oxlint")
      if (found) lintBin = found
    }

    if (lintBin) {
      const proc = Bun.spawn([lintBin, "--help"], { stdout: "pipe" })
      await proc.exited
      const help = await readableStreamToText(proc.stdout)
      if (help.includes("--lsp")) {
        return {
          process: spawn(lintBin, ["--lsp"], {
            cwd: root,
          }),
        }
      }
    }

    let serverBin = await resolveBin(serverTarget)
    if (!serverBin) {
      const found = Bun.which("oxc_language_server")
      if (found) serverBin = found
    }
    if (serverBin) {
      return {
        process: spawn(serverBin, [], {
          cwd: root,
        }),
      }
    }

    LSPServer.log.info("oxlint not found, please install oxlint")
    return
  },
}

export const Biome: LSPServer.Info = {
  id: "biome",
  root: LSPServer.NearestRoot([
    "biome.json",
    "biome.jsonc",
    "package-lock.json",
    "bun.lockb",
    "bun.lock",
    "pnpm-lock.yaml",
    "yarn.lock",
  ]),
  extensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".json",
    ".jsonc",
    ".vue",
    ".astro",
    ".svelte",
    ".css",
    ".graphql",
    ".gql",
    ".html",
  ],
  async spawn(root) {
    const localBin = path.join(root, "node_modules", ".bin", "biome")
    let bin: string | undefined
    if (await Bun.file(localBin).exists()) bin = localBin
    if (!bin) {
      const found = Bun.which("biome")
      if (found) bin = found
    }

    let args = ["lsp-proxy", "--stdio"]

    if (!bin) {
      const resolved = await Bun.resolve("biome", root).catch(() => undefined)
      if (!resolved) return
      bin = BunProc.which()
      args = ["x", "biome", "lsp-proxy", "--stdio"]
    }

    const proc = spawn(bin, args, {
      cwd: root,
      env: {
        ...process.env,
        BUN_BE_BUN: "1",
      },
    })

    return {
      process: proc,
    }
  },
}
