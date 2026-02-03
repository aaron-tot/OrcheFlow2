import { spawn } from "child_process"
import path from "path"
import { Global } from "../../../shared/utils/global"
import { BunProc } from "../../runtime/bun"
import { Instance } from "../../../core/instance"
import { Flag } from "../../../shared/config/flags/flag"
import { LSPServer } from "../server-core"

/**
 * Frontend Framework Language Servers
 * Purpose: Svelte, Astro servers
 */

export const Svelte: LSPServer.Info = {
  id: "svelte",
  extensions: [".svelte"],
  root: LSPServer.NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root) {
    let binary = Bun.which("svelteserver")
    const args: string[] = []
    if (!binary) {
      const js = path.join(Global.Path.bin, "node_modules", "svelte-language-server", "bin", "server.js")
      if (!(await Bun.file(js).exists())) {
        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        await Bun.spawn([BunProc.which(), "install", "svelte-language-server"], {
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
      initialization: {},
    }
  },
}

export const Astro: LSPServer.Info = {
  id: "astro",
  extensions: [".astro"],
  root: LSPServer.NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root) {
    const tsserver = await Bun.resolve("typescript/lib/tsserver.js", Instance.directory).catch(() => {})
    if (!tsserver) {
      LSPServer.log.info("typescript not found, required for Astro language server")
      return
    }
    const tsdk = path.dirname(tsserver)

    let binary = Bun.which("astro-ls")
    const args: string[] = []
    if (!binary) {
      const js = path.join(Global.Path.bin, "node_modules", "@astrojs", "language-server", "bin", "nodeServer.js")
      if (!(await Bun.file(js).exists())) {
        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        await Bun.spawn([BunProc.which(), "install", "@astrojs/language-server"], {
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
        typescript: {
          tsdk,
        },
      },
    }
  },
}
