import { spawn } from "child_process"
import path from "path"
import { Global } from "../../../shared/utils/global"
import { BunProc } from "../../runtime/bun"
import { Instance } from "../../../core/instance"
import { Flag } from "../../../shared/config/flags/flag"
import { Archive } from "../../../shared/utils/archive"
import { $ } from "bun"
import fs from "fs/promises"
import { LSPServer } from "../server-core"

/**
 * Configuration Language Servers - Part 1
 * Purpose: YAML, Lua, Prisma, Bash servers
 */

export const YamlLS: LSPServer.Info = {
  id: "yaml-ls",
  extensions: [".yaml", ".yml"],
  root: LSPServer.NearestRoot(["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"]),
  async spawn(root) {
    let binary = Bun.which("yaml-language-server")
    const args: string[] = []
    if (!binary) {
      const js = path.join(
        Global.Path.bin,
        "node_modules",
        "yaml-language-server",
        "out",
        "server",
        "src",
        "server.js",
      )
      const exists = await Bun.file(js).exists()
      if (!exists) {
        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        await Bun.spawn([BunProc.which(), "install", "yaml-language-server"], {
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
    }
  },
}

export const LuaLS: LSPServer.Info = {
  id: "lua-ls",
  root: LSPServer.NearestRoot([
    ".luarc.json",
    ".luarc.jsonc",
    ".luacheckrc",
    ".stylua.toml",
    "stylua.toml",
    "selene.toml",
    "selene.yml",
  ]),
  extensions: [".lua"],
  async spawn(root) {
    let bin = Bun.which("lua-language-server", {
      PATH: process.env["PATH"] + path.delimiter + Global.Path.bin,
    })

    if (!bin) {
      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("downloading lua-language-server from GitHub releases")

      const releaseResponse = await fetch("https:/api.github.com/repos/LuaLS/lua-language-server/releases/latest")
      if (!releaseResponse.ok) {
        LSPServer.log.error("Failed to fetch lua-language-server release info")
        return
      }

      const release = (await releaseResponse.json()) as any

      const platform = process.platform
      const arch = process.arch
      let assetName = ""

      let lualsArch: string = arch
      if (arch === "arm64") lualsArch = "arm64"
      else if (arch === "x64") lualsArch = "x64"
      else if (arch === "ia32") lualsArch = "ia32"

      let lualsPlatform: string = platform
      if (platform === "darwin") lualsPlatform = "darwin"
      else if (platform === "linux") lualsPlatform = "linux"
      else if (platform === "win32") lualsPlatform = "win32"

      const ext = platform === "win32" ? "zip" : "tar.gz"

      assetName = `lua-language-server-${release.tag_name}-${lualsPlatform}-${lualsArch}.${ext}`

      const supportedCombos = [
        "darwin-arm64.tar.gz",
        "darwin-x64.tar.gz",
        "linux-x64.tar.gz",
        "linux-arm64.tar.gz",
        "win32-x64.zip",
        "win32-ia32.zip",
      ]

      const assetSuffix = `${lualsPlatform}-${lualsArch}.${ext}`
      if (!supportedCombos.includes(assetSuffix)) {
        LSPServer.log.error(`Platform ${platform} and architecture ${arch} is not supported by lua-language-server`)
        return
      }

      const asset = release.assets.find((a: any) => a.name === assetName)
      if (!asset) {
        LSPServer.log.error(`Could not find asset ${assetName} in latest lua-language-server release`)
        return
      }

      const downloadUrl = asset.browser_download_url
      const downloadResponse = await fetch(downloadUrl)
      if (!downloadResponse.ok) {
        LSPServer.log.error("Failed to download lua-language-server")
        return
      }

      const tempPath = path.join(Global.Path.bin, assetName)
      await Bun.file(tempPath).write(downloadResponse)

      // Unlike zls which is a single self-contained binary,
      // lua-language-server needs supporting files (meta/, locale/, etc.)
      // Extract entire archive to dedicated directory to preserve all files
      const installDir = path.join(Global.Path.bin, `lua-language-server-${lualsArch}-${lualsPlatform}`)

      // Remove old installation if exists
      const stats = await fs.stat(installDir).catch(() => undefined)
      if (stats) {
        await fs.rm(installDir, { force: true, recursive: true })
      }

      await fs.mkdir(installDir, { recursive: true })

      if (ext === "zip") {
        const ok = await Archive.extractZip(tempPath, installDir)
          .then(() => true)
          .catch((error) => {
            LSPServer.log.error("Failed to extract lua-language-server archive", { error })
            return false
          })
        if (!ok) return
      } else {
        const ok = await $`tar -xzf ${tempPath} -C ${installDir}`
          .quiet()
          .then(() => true)
          .catch((error) => {
            LSPServer.log.error("Failed to extract lua-language-server archive", { error })
            return false
          })
        if (!ok) return
      }

      await fs.rm(tempPath, { force: true })

      // Binary is located in bin/ subdirectory within the extracted archive
      bin = path.join(installDir, "bin", "lua-language-server" + (platform === "win32" ? ".exe" : ""))

      if (!(await Bun.file(bin).exists())) {
        LSPServer.log.error("Failed to extract lua-language-server binary")
        return
      }

      if (platform !== "win32") {
        const ok = await $`chmod +x ${bin}`.quiet().catch((error) => {
          LSPServer.log.error("Failed to set executable permission for lua-language-server binary", {
            error,
          })
        })
        if (!ok) return
      }

      LSPServer.log.info(`installed lua-language-server`, { bin })
    }

    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
}

export const Prisma: LSPServer.Info = {
  id: "prisma",
  extensions: [".prisma"],
  root: LSPServer.NearestRoot(["schema.prisma", "prisma/schema.prisma", "prisma"], ["package.json"]),
  async spawn(root) {
    const prisma = Bun.which("prisma")
    if (!prisma) {
      LSPServer.log.info("prisma not found, please install prisma")
      return
    }
    return {
      process: spawn(prisma, ["language-server"], {
        cwd: root,
      }),
    }
  },
}

export const BashLS: LSPServer.Info = {
  id: "bash",
  extensions: [".sh", ".bash", ".zsh", ".ksh"],
  root: async () => Instance.directory,
  async spawn(root) {
    let binary = Bun.which("bash-language-server")
    const args: string[] = []
    if (!binary) {
      const js = path.join(Global.Path.bin, "node_modules", "bash-language-server", "out", "cli.js")
      if (!(await Bun.file(js).exists())) {
        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        await Bun.spawn([BunProc.which(), "install", "bash-language-server"], {
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
    args.push("start")
    const proc = spawn(binary, args, {
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
