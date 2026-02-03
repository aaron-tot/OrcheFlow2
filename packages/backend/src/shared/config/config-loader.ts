/**
 * Config Loader: File loading and parsing logic
 * Split from config.ts for better maintainability and token efficiency
 */
import { Log } from "../../shared/utils/log"
import path from "path"
import { pathToFileURL } from "url"
import os from "os"
import { type ParseError as JsoncParseError, parse as parseJsonc, printParseErrorCode } from "jsonc-parser"
import { ConfigMarkdown } from "./markdown"
import { NamedError } from "@opencode-ai/util"
import { Bus } from "../../core/bus"
import { existsSync } from "fs"
import {
  COMMAND_GLOB,
  AGENT_GLOB,
  MODE_GLOB,
  PLUGIN_GLOB,
  COMMAND_PATTERNS,
  AGENT_PATTERNS,
  DEFAULT_SCHEMA_URL,
  GLOBAL_CONFIG_FILES,
} from "./config-defaults"
import { Info, Command, Agent } from "./config-types"
import { InvalidError, JsonError } from "./config-validator"
import { Global } from "../../shared/utils/global"

const log = Log.create({ service: "config" })

// ============================================================================
// Utility Functions
// ============================================================================

function rel(item: string, patterns: string[]) {
  for (const pattern of patterns) {
    const index = item.indexOf(pattern)
    if (index === -1) continue
    return item.slice(index + pattern.length)
  }
}

function trim(file: string) {
  const ext = path.extname(file)
  return ext.length ? file.slice(0, -ext.length) : file
}

export function globalConfigFile() {
  const candidates = GLOBAL_CONFIG_FILES.map((file) => path.join(Global.Path.config, file))
  for (const file of candidates) {
    if (existsSync(file)) return file
  }
  return candidates[0]
}

// ============================================================================
// Command Loading
// ============================================================================

export async function loadCommand(dir: string) {
  const result: Record<string, Command> = {}
  for await (const item of COMMAND_GLOB.scan({
    absolute: true,
    followSymlinks: true,
    dot: true,
    cwd: dir,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async (err) => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse command ${item}`
      const { Session } = await import("../../session")
      Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
      log.error("failed to load command", { command: item, err })
      return undefined
    })
    if (!md) continue

    const file = rel(item, COMMAND_PATTERNS) ?? path.basename(item)
    const name = trim(file)

    const config = {
      name,
      ...md.data,
      template: md.content.trim(),
    }
    const parsed = Command.safeParse(config)
    if (parsed.success) {
      result[config.name] = parsed.data
      continue
    }
    throw new InvalidError({ path: item, issues: parsed.error.issues }, { cause: parsed.error })
  }
  return result
}

// ============================================================================
// Agent Loading
// ============================================================================

export async function loadAgent(dir: string) {
  const result: Record<string, Agent> = {}

  for await (const item of AGENT_GLOB.scan({
    absolute: true,
    followSymlinks: true,
    dot: true,
    cwd: dir,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async (err) => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse agent ${item}`
      const { Session } = await import("../../session")
      Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
      log.error("failed to load agent", { agent: item, err })
      return undefined
    })
    if (!md) continue

    const file = rel(item, AGENT_PATTERNS) ?? path.basename(item)
    const agentName = trim(file)

    const config = {
      name: agentName,
      ...md.data,
      prompt: md.content.trim(),
    }
    const parsed = Agent.safeParse(config)
    if (parsed.success) {
      result[config.name] = parsed.data
      continue
    }
    throw new InvalidError({ path: item, issues: parsed.error.issues }, { cause: parsed.error })
  }
  return result
}

// ============================================================================
// Mode Loading (Legacy)
// ============================================================================

export async function loadMode(dir: string) {
  const result: Record<string, Agent> = {}
  for await (const item of MODE_GLOB.scan({
    absolute: true,
    followSymlinks: true,
    dot: true,
    cwd: dir,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(async (err) => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse mode ${item}`
      const { Session } = await import("../../session")
      Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
      log.error("failed to load mode", { mode: item, err })
      return undefined
    })
    if (!md) continue

    const config = {
      name: path.basename(item, ".md"),
      ...md.data,
      prompt: md.content.trim(),
    }
    const parsed = Agent.safeParse(config)
    if (parsed.success) {
      result[config.name] = {
        ...parsed.data,
        mode: "primary" as const,
      }
      continue
    }
  }
  return result
}

// ============================================================================
// Plugin Loading
// ============================================================================

export async function loadPlugin(dir: string) {
  const plugins: string[] = []

  for await (const item of PLUGIN_GLOB.scan({
    absolute: true,
    followSymlinks: true,
    dot: true,
    cwd: dir,
  })) {
    plugins.push(pathToFileURL(item).href)
  }
  return plugins
}

// ============================================================================
// Config File Loading and Parsing
// ============================================================================

export async function loadFile(filepath: string): Promise<Info> {
  log.debug("loading", { path: filepath })
  let text = await Bun.file(filepath)
    .text()
    .catch((err) => {
      if (err.code === "ENOENT") return
      throw new JsonError({ path: filepath }, { cause: err })
    })
  if (!text) return {}
  return load(text, filepath)
}

export async function load(text: string, configFilepath: string) {
  const original = text
  text = text.replace(/\{env:([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || ""
  })

  const fileMatches = text.match(/\{file:[^}]+\}/g)
  if (fileMatches) {
    const configDir = path.dirname(configFilepath)
    const lines = text.split("\n")

    for (const match of fileMatches) {
      const lineIndex = lines.findIndex((line) => line.includes(match))
      if (lineIndex !== -1 && lines[lineIndex].trim().startsWith("/")) {
        continue // Skip if line is commented
      }
      let filePath = match.replace(/^\{file:/, "").replace(/\}$/, "")
      if (filePath.startsWith("~/")) {
        filePath = path.join(os.homedir(), filePath.slice(2))
      }
      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath)
      const fileContent = (
        await Bun.file(resolvedPath)
          .text()
          .catch((error) => {
            const errMsg = `bad file reference: "${match}"`
            if (error.code === "ENOENT") {
              throw new InvalidError(
                {
                  path: configFilepath,
                  message: errMsg + ` ${resolvedPath} does not exist`,
                },
                { cause: error },
              )
            }
            throw new InvalidError({ path: configFilepath, message: errMsg }, { cause: error })
          })
      ).trim()
      // escape newlines/quotes, strip outer quotes
      text = text.replace(match, JSON.stringify(fileContent).slice(1, -1))
    }
  }

  const errors: JsoncParseError[] = []
  const data = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length) {
    const lines = text.split("\n")
    const errorDetails = errors
      .map((e) => {
        const beforeOffset = text.substring(0, e.offset).split("\n")
        const line = beforeOffset.length
        const column = beforeOffset[beforeOffset.length - 1].length + 1
        const problemLine = lines[line - 1]

        const error = `${printParseErrorCode(e.error)} at line ${line}, column ${column}`
        if (!problemLine) return error

        return `${error}\n   Line ${line}: ${problemLine}\n${"".padStart(column + 9)}^`
      })
      .join("\n")

    throw new JsonError({
      path: configFilepath,
      message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${errorDetails}\n--- End ---`,
    })
  }

  const parsed = Info.safeParse(data)
  if (parsed.success) {
    if (!parsed.data.$schema) {
      parsed.data.$schema = DEFAULT_SCHEMA_URL
      // Write the $schema to the original text to preserve variables like {env:VAR}
      const updated = original.replace(/^\s*\{/, '{\n  "$schema": "https:/opencode.ai/config.json",')
      await Bun.write(configFilepath, updated).catch(() => {})
    }
    const data = parsed.data
    if (data.plugin) {
      for (let i = 0; i < data.plugin.length; i++) {
        const plugin = data.plugin[i]
        try {
          data.plugin[i] = import.meta.resolve!(plugin, configFilepath)
        } catch (err) {}
      }
    }
    return data
  }

  throw new InvalidError({
    path: configFilepath,
    issues: parsed.error.issues,
  })
}
