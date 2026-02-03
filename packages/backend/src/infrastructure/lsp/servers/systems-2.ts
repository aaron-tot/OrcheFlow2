import { spawn } from "child_process"
import path from "path"
import { Global } from "../../../shared/utils/global"
import { Flag } from "../../../shared/config/flags/flag"
import { Archive } from "../../../shared/utils/archive"
import { $ } from "bun"
import fs from "fs/promises"
import { LSPServer } from "../server-core"

/**
 * Systems Programming Language Servers - Part 2
 * Purpose: Zig, C#, F#, Swift servers
 */

export const Zls: LSPServer.Info = {
  id: "zls",
  extensions: [".zig", ".zon"],
  root: LSPServer.NearestRoot(["build.zig"]),
  async spawn(root) {
    let bin = Bun.which("zls", {
      PATH: process.env["PATH"] + path.delimiter + Global.Path.bin,
    })

    if (!bin) {
      const zig = Bun.which("zig")
      if (!zig) {
        LSPServer.log.error("Zig is required to use zls. Please install Zig first.")
        return
      }

      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("downloading zls from GitHub releases")

      const releaseResponse = await fetch("https:/api.github.com/repos/zigtools/zls/releases/latest")
      if (!releaseResponse.ok) {
        LSPServer.log.error("Failed to fetch zls release info")
        return
      }

      const release = (await releaseResponse.json()) as any

      const platform = process.platform
      const arch = process.arch
      let assetName = ""

      let zlsArch: string = arch
      if (arch === "arm64") zlsArch = "aarch64"
      else if (arch === "x64") zlsArch = "x86_64"
      else if (arch === "ia32") zlsArch = "x86"

      let zlsPlatform: string = platform
      if (platform === "darwin") zlsPlatform = "macos"
      else if (platform === "win32") zlsPlatform = "windows"

      const ext = platform === "win32" ? "zip" : "tar.xz"

      assetName = `zls-${zlsArch}-${zlsPlatform}.${ext}`

      const supportedCombos = [
        "zls-x86_64-linux.tar.xz",
        "zls-x86_64-macos.tar.xz",
        "zls-x86_64-windows.zip",
        "zls-aarch64-linux.tar.xz",
        "zls-aarch64-macos.tar.xz",
        "zls-aarch64-windows.zip",
        "zls-x86-linux.tar.xz",
        "zls-x86-windows.zip",
      ]

      if (!supportedCombos.includes(assetName)) {
        LSPServer.log.error(`Platform ${platform} and architecture ${arch} is not supported by zls`)
        return
      }

      const asset = release.assets.find((a: any) => a.name === assetName)
      if (!asset) {
        LSPServer.log.error(`Could not find asset ${assetName} in latest zls release`)
        return
      }

      const downloadUrl = asset.browser_download_url
      const downloadResponse = await fetch(downloadUrl)
      if (!downloadResponse.ok) {
        LSPServer.log.error("Failed to download zls")
        return
      }

      const tempPath = path.join(Global.Path.bin, assetName)
      await Bun.file(tempPath).write(downloadResponse)

      if (ext === "zip") {
        const ok = await Archive.extractZip(tempPath, Global.Path.bin)
          .then(() => true)
          .catch((error) => {
            LSPServer.log.error("Failed to extract zls archive", { error })
            return false
          })
        if (!ok) return
      } else {
        await $`tar -xf ${tempPath}`.cwd(Global.Path.bin).quiet().nothrow()
      }

      await fs.rm(tempPath, { force: true })

      bin = path.join(Global.Path.bin, "zls" + (platform === "win32" ? ".exe" : ""))

      if (!(await Bun.file(bin).exists())) {
        LSPServer.log.error("Failed to extract zls binary")
        return
      }

      if (platform !== "win32") {
        await $`chmod +x ${bin}`.quiet().nothrow()
      }

      LSPServer.log.info(`installed zls`, { bin })
    }

    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
}

export const CSharp: LSPServer.Info = {
  id: "csharp",
  root: LSPServer.NearestRoot([".sln", ".csproj", "global.json"]),
  extensions: [".cs"],
  async spawn(root) {
    let bin = Bun.which("csharp-ls", {
      PATH: process.env["PATH"] + path.delimiter + Global.Path.bin,
    })
    if (!bin) {
      if (!Bun.which("dotnet")) {
        LSPServer.log.error(".NET SDK is required to install csharp-ls")
        return
      }

      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("installing csharp-ls via dotnet tool")
      const proc = Bun.spawn({
        cmd: ["dotnet", "tool", "install", "csharp-ls", "--tool-path", Global.Path.bin],
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      })
      const exit = await proc.exited
      if (exit !== 0) {
        LSPServer.log.error("Failed to install csharp-ls")
        return
      }

      bin = path.join(Global.Path.bin, "csharp-ls" + (process.platform === "win32" ? ".exe" : ""))
      LSPServer.log.info(`installed csharp-ls`, { bin })
    }

    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
}

export const FSharp: LSPServer.Info = {
  id: "fsharp",
  root: LSPServer.NearestRoot([".sln", ".fsproj", "global.json"]),
  extensions: [".fs", ".fsi", ".fsx", ".fsscript"],
  async spawn(root) {
    let bin = Bun.which("fsautocomplete", {
      PATH: process.env["PATH"] + path.delimiter + Global.Path.bin,
    })
    if (!bin) {
      if (!Bun.which("dotnet")) {
        LSPServer.log.error(".NET SDK is required to install fsautocomplete")
        return
      }

      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("installing fsautocomplete via dotnet tool")
      const proc = Bun.spawn({
        cmd: ["dotnet", "tool", "install", "fsautocomplete", "--tool-path", Global.Path.bin],
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      })
      const exit = await proc.exited
      if (exit !== 0) {
        LSPServer.log.error("Failed to install fsautocomplete")
        return
      }

      bin = path.join(Global.Path.bin, "fsautocomplete" + (process.platform === "win32" ? ".exe" : ""))
      LSPServer.log.info(`installed fsautocomplete`, { bin })
    }

    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
}

export const SourceKit: LSPServer.Info = {
  id: "sourcekit-lsp",
  extensions: [".swift", ".objc", "objcpp"],
  root: LSPServer.NearestRoot(["Package.swift", "*.xcodeproj", "*.xcworkspace"]),
  async spawn(root) {
    // Check if sourcekit-lsp is available in the PATH
    // This is installed with the Swift toolchain
    const sourcekit = Bun.which("sourcekit-lsp")
    if (sourcekit) {
      return {
        process: spawn(sourcekit, {
          cwd: root,
        }),
      }
    }

    // If sourcekit-lsp not found, check if xcrun is available
    // This is specific to macOS where sourcekit-lsp is typically installed with Xcode
    if (!Bun.which("xcrun")) return

    const lspLoc = await $`xcrun --find sourcekit-lsp`.quiet().nothrow()

    if (lspLoc.exitCode !== 0) return

    const bin = lspLoc.text().trim()

    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
}
