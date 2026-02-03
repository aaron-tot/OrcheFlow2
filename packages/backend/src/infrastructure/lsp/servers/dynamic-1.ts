import { spawn } from "child_process"
import path from "path"
import { Global } from "../../../shared/utils/global"
import { Flag } from "../../../shared/config/flags/flag"
import { BunProc } from "../../runtime/bun"
import { LSPServer } from "../server-core"

/**
 * Dynamic Language Servers - Part 1
 * Purpose: Ruby, Ty (Python), Pyright servers
 */

export const Rubocop: LSPServer.Info = {
  id: "ruby-lsp",
  root: LSPServer.NearestRoot(["Gemfile"]),
  extensions: [".rb", ".rake", ".gemspec", ".ru"],
  async spawn(root) {
    let bin = Bun.which("rubocop", {
      PATH: process.env["PATH"] + path.delimiter + Global.Path.bin,
    })
    if (!bin) {
      const ruby = Bun.which("ruby")
      const gem = Bun.which("gem")
      if (!ruby || !gem) {
        LSPServer.log.info("Ruby not found, please install Ruby first")
        return
      }
      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("installing rubocop")
      const proc = Bun.spawn({
        cmd: ["gem", "install", "rubocop", "--bindir", Global.Path.bin],
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      })
      const exit = await proc.exited
      if (exit !== 0) {
        LSPServer.log.error("Failed to install rubocop")
        return
      }
      bin = path.join(Global.Path.bin, "rubocop" + (process.platform === "win32" ? ".exe" : ""))
      LSPServer.log.info(`installed rubocop`, {
        bin,
      })
    }
    return {
      process: spawn(bin!, ["--lsp"], {
        cwd: root,
      }),
    }
  },
}

export const Ty: LSPServer.Info = {
  id: "ty",
  extensions: [".py", ".pyi"],
  root: LSPServer.NearestRoot([
    "pyproject.toml",
    "ty.toml",
    "setup.py",
    "setup.cfg",
    "requirements.txt",
    "Pipfile",
    "pyrightconfig.json",
  ]),
  async spawn(root) {
    if (!Flag.OPENCODE_EXPERIMENTAL_LSP_TY) {
      return undefined
    }

    let binary = Bun.which("ty")

    const initialization: Record<string, string> = {}

    const potentialVenvPaths = [process.env["VIRTUAL_ENV"], path.join(root, ".venv"), path.join(root, "venv")].filter(
      (p): p is string => p !== undefined,
    )
    for (const venvPath of potentialVenvPaths) {
      const isWindows = process.platform === "win32"
      const potentialPythonPath = isWindows
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python")
      if (await Bun.file(potentialPythonPath).exists()) {
        initialization["pythonPath"] = potentialPythonPath
        break
      }
    }

    if (!binary) {
      for (const venvPath of potentialVenvPaths) {
        const isWindows = process.platform === "win32"
        const potentialTyPath = isWindows
          ? path.join(venvPath, "Scripts", "ty.exe")
          : path.join(venvPath, "bin", "ty")
        if (await Bun.file(potentialTyPath).exists()) {
          binary = potentialTyPath
          break
        }
      }
    }

    if (!binary) {
      LSPServer.log.error("ty not found, please install ty first")
      return
    }

    const proc = spawn(binary, ["server"], {
      cwd: root,
    })

    return {
      process: proc,
      initialization,
    }
  },
}

export const Pyright: LSPServer.Info = {
  id: "pyright",
  extensions: [".py", ".pyi"],
  root: LSPServer.NearestRoot(["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "pyrightconfig.json"]),
  async spawn(root) {
    let binary = Bun.which("pyright-langserver")
    const args = []
    if (!binary) {
      const js = path.join(Global.Path.bin, "node_modules", "pyright", "dist", "pyright-langserver.js")
      if (!(await Bun.file(js).exists())) {
        if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
        await Bun.spawn([BunProc.which(), "install", "pyright"], {
          cwd: Global.Path.bin,
          env: {
            ...process.env,
            BUN_BE_BUN: "1",
          },
        }).exited
      }
      binary = BunProc.which()
      args.push(...["run", js])
    }
    args.push("--stdio")

    const initialization: Record<string, string> = {}

    const potentialVenvPaths = [process.env["VIRTUAL_ENV"], path.join(root, ".venv"), path.join(root, "venv")].filter(
      (p): p is string => p !== undefined,
    )
    for (const venvPath of potentialVenvPaths) {
      const isWindows = process.platform === "win32"
      const potentialPythonPath = isWindows
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python")
      if (await Bun.file(potentialPythonPath).exists()) {
        initialization["pythonPath"] = potentialPythonPath
        break
      }
    }

    const proc = spawn(binary, args, {
      cwd: root,
      env: {
        ...process.env,
        BUN_BE_BUN: "1",
      },
    })
    return {
      process: proc,
      initialization,
    }
  },
}
