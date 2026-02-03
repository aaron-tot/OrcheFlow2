import { spawn } from "child_process"
import path from "path"
import { Global } from "../../../shared/utils/global"
import { BunProc } from "../../runtime/bun"
import { Flag } from "../../../shared/config/flags/flag"
import { Archive } from "../../../shared/utils/archive"
import { $ } from "bun"
import fs from "fs/promises"
import { LSPServer } from "../server-core"

/**
 * Dynamic Language Servers - Part 2
 * Purpose: Elixir, Dart, PHP servers
 */

export const ElixirLS: LSPServer.Info = {
  id: "elixir-ls",
  extensions: [".ex", ".exs"],
  root: LSPServer.NearestRoot(["mix.exs", "mix.lock"]),
  async spawn(root) {
    let binary = Bun.which("elixir-ls")
    if (!binary) {
      const elixirLsPath = path.join(Global.Path.bin, "elixir-ls")
      binary = path.join(
        Global.Path.bin,
        "elixir-ls-master",
        "release",
        process.platform === "win32" ? "language_server.bat" : "language_server.sh",
      )

      if (!(await Bun.file(binary).exists())) {
        const elixir = Bun.which("elixir")
        if (!elixir) {
          LSPServer.log.error("elixir is required to run elixir-ls")
          return
        }

        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        LSPServer.log.info("downloading elixir-ls from GitHub releases")

        const response = await fetch("https:/github.com/elixir-lsp/elixir-ls/archive/refs/heads/master.zip")
        if (!response.ok) return
        const zipPath = path.join(Global.Path.bin, "elixir-ls.zip")
        await Bun.file(zipPath).write(response)

        const ok = await Archive.extractZip(zipPath, Global.Path.bin)
          .then(() => true)
          .catch((error) => {
            LSPServer.log.error("Failed to extract elixir-ls archive", { error })
            return false
          })
        if (!ok) return

        await fs.rm(zipPath, {
          force: true,
          recursive: true,
        })

        await $`mix deps.get && mix compile && mix elixir_ls.release2 -o release`
          .quiet()
          .cwd(path.join(Global.Path.bin, "elixir-ls-master"))
          .env({ MIX_ENV: "prod", ...process.env })

        LSPServer.log.info(`installed elixir-ls`, {
          path: elixirLsPath,
        })
      }
    }

    return {
      process: spawn(binary, {
        cwd: root,
      }),
    }
  },
}

export const Dart: LSPServer.Info = {
  id: "dart",
  extensions: [".dart"],
  root: LSPServer.NearestRoot(["pubspec.yaml", "analysis_options.yaml"]),
  async spawn(root) {
    const dart = Bun.which("dart")
    if (!dart) {
      LSPServer.log.info("dart not found, please install dart first")
      return
    }
    return {
      process: spawn(dart, ["language-server", "--lsp"], {
        cwd: root,
      }),
    }
  },
}

export const PHPIntelephense: LSPServer.Info = {
  id: "php intelephense",
  extensions: [".php"],
  root: LSPServer.NearestRoot(["composer.json", "composer.lock", ".php-version"]),
  async spawn(root) {
    let binary = Bun.which("intelephense")
    const args: string[] = []
    if (!binary) {
      const js = path.join(Global.Path.bin, "node_modules", "intelephense", "lib", "intelephense.js")
      if (!(await Bun.file(js).exists())) {
        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        await Bun.spawn([BunProc.which(), "install", "intelephense"], {
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
        telemetry: {
          enabled: false,
        },
      },
    }
  },
}
