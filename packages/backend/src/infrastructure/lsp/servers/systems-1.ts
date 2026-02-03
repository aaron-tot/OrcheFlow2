import { spawn } from "child_process"
import path from "path"
import { Global } from "../../../shared/utils/global"
import { Filesystem } from "../../../shared/utils/filesystem"
import { Instance } from "../../../core/instance"
import { Flag } from "../../../shared/config/flags/flag"
import { Archive } from "../../../shared/utils/archive"
import { $ } from "bun"
import fs from "fs/promises"
import { LSPServer } from "../server-core"

/**
 * Systems Programming Language Servers - Part 1
 * Purpose: Go, Rust, C/C++ servers
 */

export const Gopls: LSPServer.Info = {
  id: "gopls",
  root: async (file) => {
    const work = await LSPServer.NearestRoot(["go.work"])(file)
    if (work) return work
    return LSPServer.NearestRoot(["go.mod", "go.sum"])(file)
  },
  extensions: [".go"],
  async spawn(root) {
    let bin = Bun.which("gopls", {
      PATH: process.env["PATH"] + path.delimiter + Global.Path.bin,
    })
    if (!bin) {
      if (!Bun.which("go")) return
      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return

      LSPServer.log.info("installing gopls")
      const proc = Bun.spawn({
        cmd: ["go", "install", "golang.org/x/tools/gopls@latest"],
        env: { ...process.env, GOBIN: Global.Path.bin },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      })
      const exit = await proc.exited
      if (exit !== 0) {
        LSPServer.log.error("Failed to install gopls")
        return
      }
      bin = path.join(Global.Path.bin, "gopls" + (process.platform === "win32" ? ".exe" : ""))
      LSPServer.log.info(`installed gopls`, {
        bin,
      })
    }
    return {
      process: spawn(bin!, {
        cwd: root,
      }),
    }
  },
}

export const RustAnalyzer: LSPServer.Info = {
  id: "rust",
  root: async (root) => {
    const crateRoot = await LSPServer.NearestRoot(["Cargo.toml", "Cargo.lock"])(root)
    if (crateRoot === undefined) {
      return undefined
    }
    let currentDir = crateRoot

    while (currentDir !== path.dirname(currentDir)) {
      // Stop at filesystem root
      const cargoTomlPath = path.join(currentDir, "Cargo.toml")
      try {
        const cargoTomlContent = await Bun.file(cargoTomlPath).text()
        if (cargoTomlContent.includes("[workspace]")) {
          return currentDir
        }
      } catch (err) {
        // File doesn't exist or can't be read, continue searching up
      }

      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break // Reached filesystem root
      currentDir = parentDir

      // Stop if we've gone above the app root
      if (!currentDir.startsWith(Instance.worktree)) break
    }

    return crateRoot
  },
  extensions: [".rs"],
  async spawn(root) {
    const bin = Bun.which("rust-analyzer")
    if (!bin) {
      LSPServer.log.info("rust-analyzer not found in path, please install it")
      return
    }
    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
}

export const Clangd: LSPServer.Info = {
  id: "clangd",
  root: LSPServer.NearestRoot(["compile_commands.json", "compile_flags.txt", ".clangd", "CMakeLists.txt", "Makefile"]),
  extensions: [".c", ".cpp", ".cc", ".cxx", ".c++", ".h", ".hpp", ".hh", ".hxx", ".h++"],
  async spawn(root) {
    const args = ["--background-index", "--clang-tidy"]
    const fromPath = Bun.which("clangd")
    if (fromPath) {
      return {
        process: spawn(fromPath, args, {
          cwd: root,
        }),
      }
    }

    const ext = process.platform === "win32" ? ".exe" : ""
    const direct = path.join(Global.Path.bin, "clangd" + ext)
    if (await Bun.file(direct).exists()) {
      return {
        process: spawn(direct, args, {
          cwd: root,
        }),
      }
    }

    const entries = await fs.readdir(Global.Path.bin, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (!entry.name.startsWith("clangd_")) continue
      const candidate = path.join(Global.Path.bin, entry.name, "bin", "clangd" + ext)
      if (await Bun.file(candidate).exists()) {
        return {
          process: spawn(candidate, args, {
            cwd: root,
          }),
        }
      }
    }

    if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
    LSPServer.log.info("downloading clangd from GitHub releases")

    const releaseResponse = await fetch("https:/api.github.com/repos/clangd/clangd/releases/latest")
    if (!releaseResponse.ok) {
      LSPServer.log.error("Failed to fetch clangd release info")
      return
    }

    const release = (await releaseResponse.json()) as {
      tag_name?: string
      assets?: { name?: string; browser_download_url?: string }[]
    }

    const tag = release.tag_name
    if (!tag) {
      LSPServer.log.error("clangd release did not include a tag name")
      return
    }
    const platform = process.platform
    const tokens: Record<string, string> = {
      darwin: "mac",
      linux: "linux",
      win32: "windows",
    }
    const token = tokens[platform]
    if (!token) {
      LSPServer.log.error(`Platform ${platform} is not supported by clangd auto-download`)
      return
    }

    const assets = release.assets ?? []
    const valid = (item: { name?: string; browser_download_url?: string }) => {
      if (!item.name) return false
      if (!item.browser_download_url) return false
      if (!item.name.includes(token)) return false
      return item.name.includes(tag)
    }

    const asset =
      assets.find((item) => valid(item) && item.name?.endsWith(".zip")) ??
      assets.find((item) => valid(item) && item.name?.endsWith(".tar.xz")) ??
      assets.find((item) => valid(item))
    if (!asset?.name || !asset.browser_download_url) {
      LSPServer.log.error("clangd could not match release asset", { tag, platform })
      return
    }

    const name = asset.name
    const downloadResponse = await fetch(asset.browser_download_url)
    if (!downloadResponse.ok) {
      LSPServer.log.error("Failed to download clangd")
      return
    }

    const archive = path.join(Global.Path.bin, name)
    const buf = await downloadResponse.arrayBuffer()
    if (buf.byteLength === 0) {
      LSPServer.log.error("Failed to write clangd archive")
      return
    }
    await Bun.write(archive, buf)

    const zip = name.endsWith(".zip")
    const tar = name.endsWith(".tar.xz")
    if (!zip && !tar) {
      LSPServer.log.error("clangd encountered unsupported asset", { asset: name })
      return
    }

    if (zip) {
      const ok = await Archive.extractZip(archive, Global.Path.bin)
        .then(() => true)
        .catch((error) => {
          LSPServer.log.error("Failed to extract clangd archive", { error })
          return false
        })
      if (!ok) return
    }
    if (tar) {
      await $`tar -xf ${archive}`.cwd(Global.Path.bin).quiet().nothrow()
    }
    await fs.rm(archive, { force: true })

    const bin = path.join(Global.Path.bin, "clangd_" + tag, "bin", "clangd" + ext)
    if (!(await Bun.file(bin).exists())) {
      LSPServer.log.error("Failed to extract clangd binary")
      return
    }

    if (platform !== "win32") {
      await $`chmod +x ${bin}`.quiet().nothrow()
    }

    await fs.unlink(path.join(Global.Path.bin, "clangd")).catch(() => {})
    await fs.symlink(bin, path.join(Global.Path.bin, "clangd")).catch(() => {})

    LSPServer.log.info(`installed clangd`, { bin })

    return {
      process: spawn(bin, args, {
        cwd: root,
      }),
    }
  },
}
