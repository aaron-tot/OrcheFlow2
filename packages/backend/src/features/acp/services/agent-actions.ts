/**
 * File: agent-actions.ts
 * Purpose: Agent actions, tool execution, prompt handling, and utility functions
 */

import type { CancelNotification, PromptRequest, ToolKind } from "@agentclientprotocol/sdk"
import { Log } from "../../../shared/utils/log"
import type { ACPCore } from "./agent-core"
import type { ACPConfig } from "./types"
import { Provider } from "../../providers/services/provider"
import { Agent as AgentModule } from "../../agents/services/AgentExecutor"

const log = Log.create({ service: "acp-agent-actions" })

export async function prompt(this: ACPCore.Agent, params: PromptRequest) {
  const config = this.getConfig()
  const sdk = this.getSdk()
  const sessionManager = this.getSessionManager()

  const sessionID = params.sessionId
  const session = sessionManager.get(sessionID)
  const directory = session.cwd

  const current = session.model
  const model = current ?? (await defaultModel(config, directory))
  if (!current) {
    sessionManager.setModel(session.id, model)
  }
  const agent = session.modeId ?? (await AgentModule.defaultAgent())

  const parts: Array<
    | { type: "text"; text: string; synthetic?: boolean; ignored?: boolean }
    | { type: "file"; url: string; filename: string; mime: string }
  > = []
  for (const part of params.prompt) {
    switch (part.type) {
      case "text":
        const audience = part.annotations?.audience
        const forAssistant = audience?.length === 1 && audience[0] === "assistant"
        const forUser = audience?.length === 1 && audience[0] === "user"
        parts.push({
          type: "text" as const,
          text: part.text,
          ...(forAssistant && { synthetic: true }),
          ...(forUser && { ignored: true }),
        })
        break
      case "image": {
        const parsed = parseUri(part.uri ?? "")
        const filename = parsed.type === "file" ? parsed.filename : "image"
        if (part.data) {
          parts.push({
            type: "file",
            url: `data:${part.mimeType};base64,${part.data}`,
            filename,
            mime: part.mimeType,
          })
        } else if (part.uri && part.uri.startsWith("http:")) {
          parts.push({
            type: "file",
            url: part.uri,
            filename,
            mime: part.mimeType,
          })
        }
        break
      }

      case "resource_link":
        const parsed = parseUri(part.uri)
        // Use the name from resource_link if available
        if (part.name && parsed.type === "file") {
          parsed.filename = part.name
        }
        parts.push(parsed)

        break

      case "resource": {
        const resource = part.resource
        if ("text" in resource && resource.text) {
          parts.push({
            type: "text",
            text: resource.text,
          })
        } else if ("blob" in resource && resource.blob && resource.mimeType) {
          // Binary resource (PDFs, etc.): store as file part with data URL
          const parsed = parseUri(resource.uri ?? "")
          const filename = parsed.type === "file" ? parsed.filename : "file"
          parts.push({
            type: "file",
            url: `data:${resource.mimeType};base64,${resource.blob}`,
            filename,
            mime: resource.mimeType,
          })
        }
        break
      }

      default:
        break
    }
  }

  log.info("parts", { parts })

  const cmd = (() => {
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("")
      .trim()

    if (!text.startsWith("/")) return

    const [name, ...rest] = text.slice(1).split(/\s+/)
    return { name, args: rest.join(" ").trim() }
  })()

  const done = {
    stopReason: "end_turn" as const,
    _meta: {},
  }

  if (!cmd) {
    await sdk.session.prompt({
      sessionID,
      model: {
        providerID: model.providerID,
        modelID: model.modelID,
      },
      parts,
      agent,
      directory,
    })
    return done
  }

  const command = await config.sdk.command
    .list({ directory }, { throwOnError: true })
    .then((x) => x.data!.find((c) => c.name === cmd.name))
  if (command) {
    await sdk.session.command({
      sessionID,
      command: command.name,
      arguments: cmd.args,
      model: model.providerID + "/" + model.modelID,
      agent,
      directory,
    })
    return done
  }

  switch (cmd.name) {
    case "compact":
      await config.sdk.session.summarize(
        {
          sessionID,
          directory,
          providerID: model.providerID,
          modelID: model.modelID,
        },
        { throwOnError: true },
      )
      break
  }

  return done
}

export async function cancel(this: ACPCore.Agent, params: CancelNotification) {
  const config = this.getConfig()
  const sessionManager = this.getSessionManager()
  const session = sessionManager.get(params.sessionId)
  await config.sdk.session.abort(
    {
      sessionID: params.sessionId,
      directory: session.cwd,
    },
    { throwOnError: true },
  )
}

export function toToolKind(toolName: string): ToolKind {
  const tool = toolName.toLocaleLowerCase()
  switch (tool) {
    case "bash":
      return "execute"
    case "webfetch":
      return "fetch"

    case "edit":
    case "patch":
    case "write":
      return "edit"

    case "grep":
    case "glob":
    case "context7_resolve_library_id":
    case "context7_get_library_docs":
      return "search"

    case "list":
    case "read":
      return "read"

    default:
      return "other"
  }
}

export function toLocations(toolName: string, input: Record<string, any>): { path: string }[] {
  const tool = toolName.toLocaleLowerCase()
  switch (tool) {
    case "read":
    case "edit":
    case "write":
      return input["filePath"] ? [{ path: input["filePath"] }] : []
    case "glob":
    case "grep":
      return input["path"] ? [{ path: input["path"] }] : []
    case "bash":
      return []
    case "list":
      return input["path"] ? [{ path: input["path"] }] : []
    default:
      return []
  }
}

export async function defaultModel(config: ACPConfig, cwd?: string) {
  const sdk = config.sdk
  const configured = config.defaultModel
  if (configured) return configured

  const directory = cwd ?? process.cwd()

  const specified = await sdk.config
    .get({ directory }, { throwOnError: true })
    .then((resp) => {
      const cfg = resp.data
      if (!cfg || !cfg.model) return undefined
      const parsed = Provider.parseModel(cfg.model)
      return {
        providerID: parsed.providerID,
        modelID: parsed.modelID,
      }
    })
    .catch((error) => {
      log.error("failed to load user config for default model", { error })
      return undefined
    })

  const providers = await sdk.config
    .providers({ directory }, { throwOnError: true })
    .then((x) => x.data?.providers ?? [])
    .catch((error) => {
      log.error("failed to list providers for default model", { error })
      return []
    })

  if (specified && providers.length) {
    const provider = providers.find((p) => p.id === specified.providerID)
    if (provider && provider.models[specified.modelID]) return specified
  }

  if (specified && !providers.length) return specified

  const opencodeProvider = providers.find((p) => p.id === "opencode")
  if (opencodeProvider) {
    if (opencodeProvider.models["big-pickle"]) {
      return { providerID: "opencode", modelID: "big-pickle" }
    }
    const [best] = Provider.sort(Object.values(opencodeProvider.models))
    if (best) {
      return {
        providerID: best.providerID,
        modelID: best.id,
      }
    }
  }

  const models = providers.flatMap((p) => Object.values(p.models))
  const [best] = Provider.sort(models)
  if (best) {
    return {
      providerID: best.providerID,
      modelID: best.id,
    }
  }

  if (specified) return specified

  return { providerID: "opencode", modelID: "big-pickle" }
}

export function parseUri(
  uri: string,
): { type: "file"; url: string; filename: string; mime: string } | { type: "text"; text: string } {
  try {
    if (uri.startsWith("file:/")) {
      const path = uri.slice(7)
      const name = path.split("/").pop() || path
      return {
        type: "file",
        url: uri,
        filename: name,
        mime: "text/plain",
      }
    }
    if (uri.startsWith("zed:/")) {
      const url = new URL(uri)
      const path = url.searchParams.get("path")
      if (path) {
        const name = path.split("/").pop() || path
        return {
          type: "file",
          url: `file:/${path}`,
          filename: name,
          mime: "text/plain",
        }
      }
    }
    return {
      type: "text",
      text: uri,
    }
  } catch {
    return {
      type: "text",
      text: uri,
    }
  }
}
