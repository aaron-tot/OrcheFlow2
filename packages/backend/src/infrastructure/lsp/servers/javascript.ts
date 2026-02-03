import { spawn } from "child_process"
import path from "path"
import { Global } from "../../../shared/utils/global"
import { BunProc } from "../../runtime/bun"
import { $ } from "bun"
import fs from "fs/promises"
import { Filesystem } from "../../../shared/utils/filesystem"
import { Instance } from "../../../core/instance"
import { Flag } from "../../../shared/config/flags/flag"
import { Archive } from "../../../shared/utils/archive"
import { LSPServer } from "../server-core"

/**
 * JavaScript/TypeScript Language Servers
 * Purpose: Deno, TypeScript, Vue, ESLint servers
 */

export const Deno: LSPServer.Info = {
  id: "deno",
  root: async (file) => {
    const files = Filesystem.up({
      targets: ["deno.json", "deno.jsonc"],
      start: path.dirname(file),
      stop: Instance.directory,
    })
    const first = await files.next()
    await files.return()
    if (!first.value) return undefined
    return path.dirname(first.value)
  },
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
  async spawn(root) {
    const deno = Bun.which("deno")
    if (!deno) {
      LSPServer.log.info("deno not found, please install deno first")
      return
    }
    return {
      process: spawn(deno, ["lsp"], {
        cwd: root,
      }),
    }
  },
}

export const Typescript: LSPServer.Info = {
  id: "typescript",
  root: LSPServer.NearestRoot(
    ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"],
    ["deno.json", "deno.jsonc"],
  ),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  async spawn(root) {
    const tsserver = await Bun.resolve("typescript/lib/tsserver.js", Instance.directory).catch(() => {})
    LSPServer.log.info("typescript server", { tsserver })
    if (!tsserver) return
    const proc = spawn(BunProc.which(), ["x", "typescript-language-server", "--stdio"], {
      cwd: root,
      env: {
        ...process.env,
        BUN_BE_BUN: "1",
      },
    })
    return {
      process: proc,
      initialization: {
        tsserver: {
          path: tsserver,
        },
      },
    }
  },
}

export const Vue: LSPServer.Info = {
  id: "vue",
  extensions: [".vue"],
  root: LSPServer.NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root) {
    let binary = Bun.which("vue-language-server")
    const args: string[] = []
    if (!binary) {
      const js = path.join(
        Global.Path.bin,
        "node_modules",
        "@vue",
        "language-server",
        "bin",
        "vue-language-server.js",
      )
      if (!(await Bun.file(js).exists())) {
        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        await Bun.spawn([BunProc.which(), "install", "@vue/language-server"], {
          cwd: Global.Path.bin,
          env: {
            ...process.env,
            BUN_BE_BUN: "1",
          },
          stdout: "pipe",
          stderr: "pipe",
          stdin: "pipe",
        }).exited
      }
      binary = BunProc.which()
      args.push("run", js)
    }
    args.push("--stdio")
    const proc = spawn(binary, args, {
      cwd: root,
      env: {
        ...process.env,
        BUN_BE_BUN: "1",
      },
    })
    return {
      process: proc,
      initialization: {
        // Leave empty; the server will auto-detect workspace TypeScript.
      },
    }
  },
}

export const ESLint: LSPServer.Info = {
  id: "eslint",
  root: LSPServer.NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue"],
  async spawn(root) {
    const eslint = await Bun.resolve("eslint", Instance.directory).catch(() => {})
    if (!eslint) return
    LSPServer.log.info("spawning eslint server")
    const serverPath = path.join(Global.Path.bin, "vscode-eslint", "server", "out", "eslintServer.js")
    if (!(await Bun.file(serverPath).exists())) {
      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("downloading and building VS Code ESLint server")
      const response = await fetch("https:/github.com/microsoft/vscode-eslint/archive/refs/heads/main.zip")
      if (!response.ok) return

      const zipPath = path.join(Global.Path.bin, "vscode-eslint.zip")
      await Bun.file(zipPath).write(response)

      const ok = await Archive.extractZip(zipPath, Global.Path.bin)
        .then(() => true)
        .catch((error) => {
          LSPServer.log.error("Failed to extract vscode-eslint archive", { error })
          return false
        })
      if (!ok) return
      await fs.rm(zipPath, { force: true })

      const extractedPath = path.join(Global.Path.bin, "vscode-eslint-main")
      const finalPath = path.join(Global.Path.bin, "vscode-eslint")

      const stats = await fs.stat(finalPath).catch(() => undefined)
      if (stats) {
        LSPServer.log.info("removing old eslint installation", { path: finalPath })
        await fs.rm(finalPath, { force: true, recursive: true })
      }
      await fs.rename(extractedPath, finalPath)

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
      await $`${npmCmd} install`.cwd(finalPath).quiet()
      await $`${npmCmd} run compile`.cwd(finalPath).quiet()

      LSPServer.log.info("installed VS Code ESLint server", { serverPath })
    }

    const proc = spawn(BunProc.which(), [serverPath, "--stdio"], {
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
