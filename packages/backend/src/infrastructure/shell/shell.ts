// Full updated file: replace the entire Shell namespace block with this

import { Flag } from "../../shared/config/flags/flag"
import { lazy } from "../../shared/utils/lazy"
import path from "path"
import { spawn, type ChildProcess } from "child_process"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", () => resolve())
        killer.once("error", () => resolve())
      })
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (error) {
      console.error('[OpenCode Error]: Failed to kill process group with SIGKILL', { pid, error })
      proc.kill("SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }

  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      // Honor explicit override first
      if (Flag.OPENCODE_GIT_BASH_PATH) return Flag.OPENCODE_GIT_BASH_PATH

      const git = Bun.which("git")
      if (git) {
        // git.exe usually at C:\Program Files\Git\cmd\git.exe
        // Real bash.exe lives in usr\bin (full tools), bin\bash.exe is just a wrapper
        // Prefer usr\bin first → avoids spawn issues with wrapper in non-terminal contexts
        let bash = path.join(git, "..", "..", "usr", "bin", "bash.exe")
        if (Bun.file(bash).size > 0) return bash

        // Fallback to original logic if needed (unlikely to work, but kept for compatibility)
        bash = path.join(git, "..", "..", "bin", "bash.exe")
        if (Bun.file(bash).size > 0) return bash
      }

      // Ultimate fallback on Windows
      return process.env.COMSPEC || "cmd.exe"
    }

    if (process.platform === "darwin") return "/bin/zsh"

    const bash = Bun.which("bash")
    if (bash) return bash

    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    const s = process.env.SHELL
    if (s) return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    const s = process.env.SHELL
    if (s && !BLACKLIST.has(process.platform === "win32" ? path.win32.basename(s) : path.basename(s))) {
      return s
    }
    return fallback()
  })
}


