/**
 * Config: Main export and orchestration
 * Split from original monolithic config.ts for better maintainability and token efficiency
 */
import { Log } from "../../shared/utils/log"
import path from "path"
import os from "os"
import { Filesystem } from "../../shared/utils/filesystem"
import { mergeDeep, pipe, unique } from "remeda"
import { Global } from "../../shared/utils/global"
import fs from "fs/promises"
import { lazy } from "../../shared/utils/lazy"
import { Flag } from "../../shared/config/flags/flag"
import { Auth } from "../../infrastructure/auth"
import { applyEdits, modify } from "jsonc-parser"
import { Instance } from "../../core/instance"
import { BunProc } from "../../infrastructure/runtime/bun"
import { existsSync } from "fs"
import { GlobalBus } from "../../core/bus/global"
import { Event } from "../../app/event"

// Import split modules
import {
  Info,
  Agent,
  Command,
  Permission,
  PermissionAction,
  Mcp,
  McpOAuth,
  Provider,
  Layout,
} from "./config-types"
import { DEFAULT_GITIGNORE_ENTRIES, PROJECT_CONFIG_FILES } from "./config-defaults"
import { loadFile, load, loadCommand, loadAgent, loadMode, loadPlugin, globalConfigFile } from "./config-loader"
import { isRecord, parseConfig } from "./config-validator"

// Re-export types for backward compatibility
export { Info, Agent, Command, Permission, PermissionAction, Mcp, McpOAuth, Provider, Layout }

export namespace Config {
  const log = Log.create({ service: "config" })

  // ============================================================================
  // Plugin Management
  // ============================================================================

  /**
   * Extracts a canonical plugin name from a plugin specifier.
   * - For file:/ URLs: extracts filename without extension
   * - For npm packages: extracts package name without version
   *
   * @example
   * getPluginName("file://path/to/plugin/foo.js") // "foo"
   * getPluginName("oh-my-opencode@2.4.3") // "oh-my-opencode"
   * getPluginName("@scope/pkg@1.0.0") // "@scope/pkg"
   */
  export function getPluginName(plugin: string): string {
    if (plugin.startsWith("file:/")) {
      return path.parse(new URL(plugin).pathname).name
    }
    const lastAt = plugin.lastIndexOf("@")
    if (lastAt > 0) {
      return plugin.substring(0, lastAt)
    }
    return plugin
  }

  /**
   * Deduplicates plugins by name, with later entries (higher priority) winning.
   * Priority order (highest to lowest):
   * 1. Local plugin/ directory
   * 2. Local opencode.json
   * 3. Global plugin/ directory
   * 4. Global opencode.json
   *
   * Since plugins are added in low-to-high priority order,
   * we reverse, deduplicate (keeping first occurrence), then restore order.
   */
  export function deduplicatePlugins(plugins: string[]): string[] {
    const seenNames = new Set<string>()
    const uniqueSpecifiers: string[] = []

    for (const specifier of plugins.toReversed()) {
      const name = getPluginName(specifier)
      if (!seenNames.has(name)) {
        seenNames.add(name)
        uniqueSpecifiers.push(specifier)
      }
    }

    return uniqueSpecifiers.toReversed()
  }

  // ============================================================================
  // Config Merging
  // ============================================================================

  // Custom merge function that concatenates array fields instead of replacing them
  function mergeConfigConcatArrays(target: Info, source: Info): Info {
    const merged = mergeDeep(target, source)
    if (target.plugin && source.plugin) {
      merged.plugin = Array.from(new Set([...target.plugin, ...source.plugin]))
    }
    if (target.instructions && source.instructions) {
      merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
    }
    return merged
  }

  // ============================================================================
  // Dependency Installation
  // ============================================================================

  export async function installDependencies(dir: string) {
    const pkg = path.join(dir, "package.json")

    if (!(await Bun.file(pkg).exists())) {
      await Bun.write(pkg, "{}")
    }

    const gitignore = path.join(dir, ".gitignore")
    const hasGitIgnore = await Bun.file(gitignore).exists()
    if (!hasGitIgnore) await Bun.write(gitignore, DEFAULT_GITIGNORE_ENTRIES.join("\n"))

    await BunProc.run(["add", "@opencode-ai/plugin@latest", "--exact"], {
      cwd: dir,
    }).catch((error) => {
      console.error("[OpenCode Error]: Failed to install @opencode-ai/plugin package", { dir, error })
    })

    // Install any additional dependencies defined in the package.json
    await BunProc.run(["install"], { cwd: dir }).catch((error) => {
      console.error("[OpenCode Error]: Failed to install package dependencies", { dir, error })
    })
  }

  // ============================================================================
  // Global Config Loading
  // ============================================================================

  export const global = lazy(async () => {
    let result: Info = pipe(
      {},
      mergeDeep(await loadFile(path.join(Global.Path.config, "config.json"))),
      mergeDeep(await loadFile(path.join(Global.Path.config, "opencode.json"))),
      mergeDeep(await loadFile(path.join(Global.Path.config, "opencode.jsonc"))),
    )

    await import(path.join(Global.Path.config, "config"), {
      with: {
        type: "toml",
      },
    })
      .then(async (mod) => {
        const { provider, model, ...rest } = mod.default
        if (provider && model) result.model = `${provider}/${model}`
        result["$schema"] = "https:/opencode.ai/config.json"
        result = mergeDeep(result, rest)
        await Bun.write(path.join(Global.Path.config, "config.json"), JSON.stringify(result, null, 2))
        await fs.unlink(path.join(Global.Path.config, "config"))
      })
      .catch(() => {})

    return result
  })

  // ============================================================================
  // Main State Management
  // ============================================================================

  export const state = Instance.state(async () => {
    const auth = await Auth.all()

    // Load remote/well-known config first as the base layer (lowest precedence)
    let result: Info = {}
    for (const [key, value] of Object.entries(auth)) {
      if (value.type === "wellknown") {
        process.env[value.key] = value.token
        log.debug("fetching remote config", { url: `${key}/.well-known/opencode` })
        const response = await fetch(`${key}/.well-known/opencode`)
        if (!response.ok) {
          throw new Error(`failed to fetch remote config from ${key}: ${response.status}`)
        }
        const wellknown = (await response.json()) as any
        const remoteConfig = wellknown.config ?? {}
        // Add $schema to prevent load() from trying to write back to a non-existent file
        if (!remoteConfig.$schema) remoteConfig.$schema = "https:/opencode.ai/config.json"
        result = mergeConfigConcatArrays(
          result,
          await load(JSON.stringify(remoteConfig), `${key}/.well-known/opencode`),
        )
        log.debug("loaded remote config from well-known", { url: key })
      }
    }

    // Global user config overrides remote config
    result = mergeConfigConcatArrays(result, await global())

    // Custom config path overrides global
    if (Flag.OPENCODE_CONFIG) {
      result = mergeConfigConcatArrays(result, await loadFile(Flag.OPENCODE_CONFIG))
      log.debug("loaded custom config", { path: Flag.OPENCODE_CONFIG })
    }

    // Project config has highest precedence
    for (const file of PROJECT_CONFIG_FILES) {
      const found = await Filesystem.findUp(file, Instance.directory, Instance.worktree)
      for (const resolved of found.toReversed()) {
        result = mergeConfigConcatArrays(result, await loadFile(resolved))
      }
    }

    // Inline config content has highest precedence
    if (Flag.OPENCODE_CONFIG_CONTENT) {
      result = mergeConfigConcatArrays(result, JSON.parse(Flag.OPENCODE_CONFIG_CONTENT))
      log.debug("loaded custom config from OPENCODE_CONFIG_CONTENT")
    }

    result.agent = result.agent || {}
    result.mode = result.mode || {}
    result.plugin = result.plugin || []

    const directories = [
      Global.Path.config,
      ...(await Array.fromAsync(
        Filesystem.up({
          targets: [".opencode"],
          start: Instance.directory,
          stop: Instance.worktree,
        }),
      )),
      ...(await Array.fromAsync(
        Filesystem.up({
          targets: [".opencode"],
          start: Global.Path.home,
          stop: Global.Path.home,
        }),
      )),
    ]

    if (Flag.OPENCODE_CONFIG_DIR) {
      directories.push(Flag.OPENCODE_CONFIG_DIR)
      log.debug("loading config from OPENCODE_CONFIG_DIR", { path: Flag.OPENCODE_CONFIG_DIR })
    }

    for (const dir of unique(directories)) {
      if (dir.endsWith(".opencode") || dir === Flag.OPENCODE_CONFIG_DIR) {
        for (const file of PROJECT_CONFIG_FILES) {
          log.debug(`loading config from ${path.join(dir, file)}`)
          result = mergeConfigConcatArrays(result, await loadFile(path.join(dir, file)))
          // to satisfy the type checker
          result.agent ??= {}
          result.mode ??= {}
          result.plugin ??= []
        }
      }

      const exists = existsSync(path.join(dir, "node_modules"))
      const installing = installDependencies(dir)
      if (!exists) await installing

      result.command = mergeDeep(result.command ?? {}, await loadCommand(dir))
      result.agent = mergeDeep(result.agent, await loadAgent(dir))
      result.agent = mergeDeep(result.agent, await loadMode(dir))
      result.plugin.push(...(await loadPlugin(dir)))
    }

    // Migrate deprecated mode field to agent field
    for (const [name, mode] of Object.entries(result.mode)) {
      result.agent = mergeDeep(result.agent ?? {}, {
        [name]: {
          ...mode,
          mode: "primary" as const,
        },
      })
    }

    if (Flag.OPENCODE_PERMISSION) {
      result.permission = mergeDeep(result.permission ?? {}, JSON.parse(Flag.OPENCODE_PERMISSION))
    }

    // Backwards compatibility: legacy top-level `tools` config
    if (result.tools) {
      const perms: Record<string, Config.PermissionAction> = {}
      for (const [tool, enabled] of Object.entries(result.tools)) {
        const action: Config.PermissionAction = enabled ? "allow" : "deny"
        if (tool === "write" || tool === "edit" || tool === "patch" || tool === "multiedit") {
          perms.edit = action
          continue
        }
        perms[tool] = action
      }
      result.permission = mergeDeep(perms, result.permission ?? {})
    }

    if (!result.username) result.username = os.userInfo().username

    // Handle migration from autoshare to share field
    if (result.autoshare === true && !result.share) {
      result.share = "auto"
    }

    if (!result.keybinds) result.keybinds = Info.shape.keybinds.parse({})

    // Apply flag overrides for compaction settings
    if (Flag.OPENCODE_DISABLE_AUTOCOMPACT) {
      result.compaction = { ...result.compaction, auto: false }
    }
    if (Flag.OPENCODE_DISABLE_PRUNE) {
      result.compaction = { ...result.compaction, prune: false }
    }

    result.plugin = deduplicatePlugins(result.plugin ?? [])

    return {
      config: result,
      directories,
    }
  })

  // ============================================================================
  // JSONC Patching Utilities
  // ============================================================================

  function patchJsonc(input: string, patch: unknown, path: string[] = []): string {
    if (!isRecord(patch)) {
      const edits = modify(input, path, patch, {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
        },
      })
      return applyEdits(input, edits)
    }

    return Object.entries(patch).reduce((result, [key, value]) => {
      if (value === undefined) return result
      return patchJsonc(result, value, [...path, key])
    }, input)
  }

  // ============================================================================
  // Public API
  // ============================================================================

  export async function get() {
    return state().then((x) => x.config)
  }

  export async function getGlobal() {
    return global()
  }

  export async function update(config: Info) {
    const filepath = path.join(Instance.directory, "config.json")
    const existing = await loadFile(filepath)
    await Bun.write(filepath, JSON.stringify(mergeDeep(existing, config), null, 2))
    await Instance.dispose()
  }

  export async function updateGlobal(config: Info) {
    const filepath = globalConfigFile()
    const before = await Bun.file(filepath)
      .text()
      .catch((err) => {
        if (err.code === "ENOENT") return "{}"
        throw new Error(`Failed to read config file: ${err.message}`)
      })

    if (!filepath.endsWith(".jsonc")) {
      const existing = parseConfig(before, filepath)
      await Bun.write(filepath, JSON.stringify(mergeDeep(existing, config), null, 2))
    } else {
      const next = patchJsonc(before, config)
      parseConfig(next, filepath)
      await Bun.write(filepath, next)
    }

    global.reset()
    await Instance.disposeAll()
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Event.Disposed.type,
        properties: {},
      },
    })
  }

  export async function directories() {
    return state().then((x) => x.directories)
  }
}


