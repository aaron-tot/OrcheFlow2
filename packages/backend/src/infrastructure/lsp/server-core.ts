import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import path from "path"
import { Log } from "../../shared/utils/log"
import { Filesystem } from "../../shared/utils/filesystem"
import { Instance } from "../../core/instance"
import fs from "fs/promises"

/**
 * LSP Server Core Types and Utilities
 * Purpose: Shared types, helpers, and logging for LSP servers
 */
export namespace LSPServer {
  export const log = Log.create({ service: "lsp.server" })

  export const pathExists = async (p: string) =>
    fs
      .stat(p)
      .then(() => true)
      .catch(() => false)

  export interface Handle {
    process: ChildProcessWithoutNullStreams
    initialization?: Record<string, any>
  }

  export type RootFunction = (file: string) => Promise<string | undefined>

  export const NearestRoot = (includePatterns: string[], excludePatterns?: string[]): RootFunction => {
    return async (file) => {
      if (excludePatterns) {
        const excludedFiles = Filesystem.up({
          targets: excludePatterns,
          start: path.dirname(file),
          stop: Instance.directory,
        })
        const excluded = await excludedFiles.next()
        await excludedFiles.return()
        if (excluded.value) return undefined
      }
      const files = Filesystem.up({
        targets: includePatterns,
        start: path.dirname(file),
        stop: Instance.directory,
      })
      const first = await files.next()
      await files.return()
      if (!first.value) return Instance.directory
      return path.dirname(first.value)
    }
  }

  export interface Info {
    id: string
    extensions: string[]
    global?: boolean
    root: RootFunction
    spawn(root: string): Promise<Handle | undefined>
  }
}
