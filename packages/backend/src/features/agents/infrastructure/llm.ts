import os from "os"
import fs from "fs/promises"
import path from "path"
// Installation moved to CLI package
// import { Installation } from "../../../infrastructure/installation"
const Installation = { VERSION: "1.0.0-backend" } // Temporary placeholder for backend
import { Provider } from "../../providers/services/provider"
import { Global } from "../../../shared/utils/global"
import { Log } from "../../../shared/utils/log"
import {
  streamText,
  wrapLanguageModel,
  type ModelMessage,
  type StreamTextResult,
  type Tool,
  type ToolSet,
  extractReasoningMiddleware,
  tool,
  jsonSchema,
} from "ai"
import { clone, mergeDeep, pipe } from "remeda"
import { ProviderTransform } from "../../providers/services/transform"
import { Config } from "../../../shared/config/config"
import { Instance } from "../../../core/instance"
import type { Agent } from "../../agents/services/agent"
import type { MessageV2 } from "./message-v2"
import { Plugin } from "../../plugins/services"
import { SystemPrompt } from "./system"
import { Flag } from "../../../shared/config/flags/flag"
import { PermissionNext } from "../../permissions/services/next"
import { Auth } from "../../../infrastructure/auth"

export namespace LLM {
  const log = Log.create({ service: "llm" })

  export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

  // Session-based logging directory
  const sessionLogDirs = new Map<string, string>()

  async function getSessionLogDir(sessionID: string): Promise<string> {
    if (sessionLogDirs.has(sessionID)) {
      return sessionLogDirs.get(sessionID)!
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
    // Save to project root for easier access
    const sessionDir = path.join(process.cwd(), `${sessionID}_${timestamp}`)
    await fs.mkdir(sessionDir, { recursive: true })
    sessionLogDirs.set(sessionID, sessionDir)
    return sessionDir
  }

  // Custom JSON serializer that normalizes line endings in strings
  function prettyJSON(data: any): string {
    return JSON.stringify(data, (key, value) => {
      if (typeof value === 'string') {
        // Normalize Windows line endings to Unix
        return value.replace(/\r\n/g, '\n')
      }
      return value
    }, 2)
  }

  async function logRequest(sessionID: string, data: any): Promise<void> {
    try {
      const sessionDir = await getSessionLogDir(sessionID)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
      const filename = `${timestamp}_request.json`
      await fs.writeFile(
        path.join(sessionDir, filename),
        prettyJSON(data)
      )
    } catch (e) {
      log.error('Failed to log request', { error: e })
    }
  }

  async function logResponse(sessionID: string, data: any): Promise<void> {
    try {
      const sessionDir = await getSessionLogDir(sessionID)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
      const filename = `${timestamp}_response.json`
      await fs.writeFile(
        path.join(sessionDir, filename),
        prettyJSON(data)
      )
    } catch (e) {
      log.error('Failed to log response', { error: e })
    }
  }

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    model: Provider.Model
    agent: Agent.Info
    system: string[]
    abort: AbortSignal
    messages: ModelMessage[]
    small?: boolean
    tools: Record<string, Tool>
    retries?: number
  }

  export type StreamOutput = StreamTextResult<ToolSet, unknown>

  export async function stream(input: StreamInput) {
    const l = log
      .clone()
      .tag("providerID", input.model.providerID)
      .tag("modelID", input.model.id)
      .tag("sessionID", input.sessionID)
      .tag("small", (input.small ?? false).toString())
      .tag("agent", input.agent.name)
    l.info("stream", {
      modelID: input.model.id,
      providerID: input.model.providerID,
    })
    const [language, cfg, provider, auth] = await Promise.all([
      Provider.getLanguage(input.model),
      Config.get(),
      Provider.getProvider(input.model.providerID),
      Auth.get(input.model.providerID),
    ])
    const isCodex = provider.id === "openai" && auth?.type === "oauth"

    // Get system prompts (await since SystemPrompt.provider is now async)
    const providerPrompts = input.agent.prompt 
      ? [input.agent.prompt] 
      : isCodex 
        ? [] 
        : await SystemPrompt.provider(input.model)

    const system = SystemPrompt.header(input.model.providerID)
    system.push(
      [
        // use agent prompt otherwise provider prompt
        // For Codex sessions, skip SystemPrompt.provider() since it's sent via options.instructions
        ...providerPrompts,
        // any custom prompt passed into this call
        ...input.system,
        // any custom prompt from last user message
        ...(input.user.system ? [input.user.system] : []),
      ]
        .filter((x) => x)
        .join("\n"),
    )

    const header = system[0]
    const original = clone(system)
    await Plugin.trigger("experimental.chat.system.transform", { sessionID: input.sessionID }, { system })
    if (system.length === 0) {
      system.push(...original)
    }
    // rejoin to maintain 2-part structure for caching if header unchanged
    if (system.length > 2 && system[0] === header) {
      const rest = system.slice(1)
      system.length = 0
      system.push(header, rest.join("\n"))
    }

    const variant =
      !input.small && input.model.variants && input.user.variant ? input.model.variants[input.user.variant] : {}
    const base = input.small
      ? ProviderTransform.smallOptions(input.model)
      : ProviderTransform.options({
          model: input.model,
          sessionID: input.sessionID,
          providerOptions: provider.options,
        })
    const options: Record<string, any> = pipe(
      base,
      mergeDeep(input.model.options),
      mergeDeep(input.agent.options),
      mergeDeep(variant),
    )
    if (isCodex) {
      options.instructions = SystemPrompt.instructions()
    }

    const params = await Plugin.trigger(
      "chat.params",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        provider,
        message: input.user,
      },
      {
        temperature: input.model.capabilities.temperature
          ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
          : undefined,
        topP: input.agent.topP ?? ProviderTransform.topP(input.model),
        topK: ProviderTransform.topK(input.model),
        options,
      },
    )

    const maxOutputTokens = isCodex
      ? undefined
      : ProviderTransform.maxOutputTokens(
          input.model.api.npm,
          params.options,
          input.model.limit.output,
          OUTPUT_TOKEN_MAX,
        )

    const tools = await resolveTools(input)

    // LiteLLM and some Anthropic proxies require the tools parameter to be present
    // when message history contains tool calls, even if no tools are being used.
    // Add a dummy tool that is never called to satisfy this validation.
    // This is enabled for:
    // 1. Providers with "litellm" in their ID or API ID (auto-detected)
    // 2. Providers with explicit "litellmProxy: true" option (opt-in for custom gateways)
    const isLiteLLMProxy =
      provider.options?.["litellmProxy"] === true ||
      input.model.providerID.toLowerCase().includes("litellm") ||
      input.model.api.id.toLowerCase().includes("litellm")

    if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
      tools["_noop"] = tool({
        description:
          "Placeholder for LiteLLM/Anthropic proxy compatibility - required when message history contains tool calls but no active tools are needed",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => ({ output: "", title: "", metadata: {} }),
      })
    }

    // Log the request
    await logRequest(input.sessionID, {
      timestamp: new Date().toISOString(),
      sessionID: input.sessionID,
      modelID: input.model.id,
      providerID: input.model.providerID,
      agent: input.agent.name,
      system,
      messages: input.messages,
      tools: Object.keys(tools),
      params: {
        temperature: params.temperature,
        topP: params.topP,
        topK: params.topK,
        maxOutputTokens,
      },
    })

    const streamResult = await streamText({
      onError(error) {
        l.error("stream error", {
          error,
        })
      },
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase()
        if (lower !== failed.toolCall.toolName && tools[lower]) {
          l.info("repairing tool call", {
            tool: failed.toolCall.toolName,
            repaired: lower,
          })
          return {
            ...failed.toolCall,
            toolName: lower,
          }
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
          toolName: "invalid",
        }
      },
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      providerOptions: ProviderTransform.providerOptions(input.model, params.options),
      activeTools: Object.keys(tools).filter((x) => x !== "invalid" && x !== "_noop"),
      tools,
      maxOutputTokens,
      abortSignal: input.abort,
      headers: {
        ...(isCodex
          ? {
              originator: "opencode",
              "User-Agent": `opencode/${Installation.VERSION} (${os.platform()} ${os.release()}; ${os.arch()})`,
              session_id: input.sessionID,
            }
          : undefined),
        ...(input.model.providerID.startsWith("opencode")
          ? {
              "x-opencode-project": Instance.project.id,
              "x-opencode-session": input.sessionID,
              "x-opencode-request": input.user.id,
              "x-opencode-client": Flag.OPENCODE_CLIENT,
            }
          : input.model.providerID !== "anthropic"
            ? {
                "User-Agent": `opencode/${Installation.VERSION}`,
              }
            : undefined),
        ...input.model.headers,
      },
      maxRetries: input.retries ?? 0,
      messages: [
        ...(isCodex
          ? [
              {
                role: "user",
                content: system.join("\n\n"),
              } as ModelMessage,
            ]
          : system.map(
              (x): ModelMessage => ({
                role: "system",
                content: x,
              }),
            )),
        ...input.messages,
      ],
      model: wrapLanguageModel({
        model: language,
        middleware: [
          {
            async transformParams(args) {
              if (args.type === "stream") {
                // @ts-expect-error
                args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)
              }
              return args.params
            },
          },
          extractReasoningMiddleware({ tagName: "think", startWithReasoning: false }),
        ],
      }),
      experimental_telemetry: { isEnabled: cfg.experimental?.openTelemetry },
    })

    // Log the response asynchronously (fire and forget)
    ;(async () => {
      try {
        const [text, finishReason, usage, toolCalls, toolResults] = await Promise.all([
          streamResult.text,
          streamResult.finishReason,
          streamResult.usage,
          streamResult.toolCalls,
          streamResult.toolResults,
        ])
        await logResponse(input.sessionID, {
          timestamp: new Date().toISOString(),
          sessionID: input.sessionID,
          text,
          finishReason,
          usage,
          toolCalls,
          toolResults,
        })
      } catch (e) {
        log.error('Failed to log response', { error: e })
      }
    })()

    return streamResult
  }

  async function resolveTools(input: Pick<StreamInput, "tools" | "agent" | "user">) {
    const disabled = PermissionNext.disabled(Object.keys(input.tools), input.agent.permission)
    for (const tool of Object.keys(input.tools)) {
      if (input.user.tools?.[tool] === false || disabled.has(tool)) {
        delete input.tools[tool]
      }
    }
    return input.tools
  }

  // Check if messages contain any tool-call content
  // Used to determine if a dummy tool should be added for LiteLLM proxy compatibility
  export function hasToolCalls(messages: ModelMessage[]): boolean {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue
      for (const part of msg.content) {
        if (part.type === "tool-call" || part.type === "tool-result") return true
      }
    }
    return false
  }
}


