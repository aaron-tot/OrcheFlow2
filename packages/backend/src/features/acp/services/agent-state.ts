/**
 * File: agent-state.ts
 * Purpose: State management, context, lifecycle, and event handling
 */

import {
  RequestError,
  type LoadSessionRequest,
  type NewSessionRequest,
  type PlanEntry,
  type Role,
  type SetSessionModelRequest,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type ToolCallContent,
} from "@agentclientprotocol/sdk"
import { Log } from "../../../shared/utils/log"
import type { ACPCore } from "./agent-core"
import { Provider } from "../../providers/services/provider"
import { Agent as AgentModule } from "../../agents/services/AgentExecutor"
import { MessageV2 } from "../../agents/infrastructure/message-v2"
import { Config } from "../../../shared/config/config"
import { Todo } from "../../agents/infrastructure/todo"
import { z } from "zod"
import { LoadAPIKeyError } from "ai"
import type { Event, SessionMessageResponse } from "@opencode-ai/sdk/v2"
import { applyPatch } from "diff"
import { toToolKind, toLocations, parseUri, defaultModel } from "./agent-actions"

const log = Log.create({ service: "acp-agent-state" })

export async function handleEvent(this: ACPCore.Agent, event: Event) {
  const connection = this.getConnection()
  const sdk = this.getSdk()
  const sessionManager = this.getSessionManager()
  const permissionQueues = this.getPermissionQueues()
  const permissionOptions = this.getPermissionOptions()

  switch (event.type) {
    case "permission.asked": {
      const permission = event.properties
      const session = sessionManager.tryGet(permission.sessionID)
      if (!session) return

      const prev = permissionQueues.get(permission.sessionID) ?? Promise.resolve()
      const next = prev
        .then(async () => {
          const directory = session.cwd

          const res = await connection
            .requestPermission({
              sessionId: permission.sessionID,
              toolCall: {
                toolCallId: permission.tool?.callID ?? permission.id,
                status: "pending",
                title: permission.permission,
                rawInput: permission.metadata,
                kind: toToolKind(permission.permission),
                locations: toLocations(permission.permission, permission.metadata),
              },
              options: permissionOptions,
            })
            .catch(async (error) => {
              log.error("failed to request permission from ACP", {
                error,
                permissionID: permission.id,
                sessionID: permission.sessionID,
              })
              await sdk.permission.reply({
                requestID: permission.id,
                reply: "reject",
                directory,
              })
              return undefined
            })

          if (!res) return
          if (res.outcome.outcome !== "selected") {
            await sdk.permission.reply({
              requestID: permission.id,
              reply: "reject",
              directory,
            })
            return
          }

          if (res.outcome.optionId !== "reject" && permission.permission == "edit") {
            const metadata = permission.metadata || {}
            const filepath = typeof metadata["filepath"] === "string" ? metadata["filepath"] : ""
            const diff = typeof metadata["diff"] === "string" ? metadata["diff"] : ""

            const content = await Bun.file(filepath).text()
            const newContent = getNewContent(content, diff)

            if (newContent) {
              connection.writeTextFile({
                sessionId: session.id,
                path: filepath,
                content: newContent,
              })
            }
          }

          await sdk.permission.reply({
            requestID: permission.id,
            reply: res.outcome.optionId as "once" | "always" | "reject",
            directory,
          })
        })
        .catch((error) => {
          log.error("failed to handle permission", { error, permissionID: permission.id })
        })
        .finally(() => {
          if (permissionQueues.get(permission.sessionID) === next) {
            permissionQueues.delete(permission.sessionID)
          }
        })
      permissionQueues.set(permission.sessionID, next)
      return
    }

    case "message.part.updated": {
      log.info("message part updated", { event: event.properties })
      const props = event.properties
      const part = props.part
      const session = sessionManager.tryGet(part.sessionID)
      if (!session) return
      const sessionId = session.id
      const directory = session.cwd

      const message = await sdk.session
        .message(
          {
            sessionID: part.sessionID,
            messageID: part.messageID,
            directory,
          },
          { throwOnError: true },
        )
        .then((x) => x.data)
        .catch((error) => {
          log.error("unexpected error when fetching message", { error })
          return undefined
        })

      if (!message || message.info.role !== "assistant") return

      if (part.type === "tool") {
        switch (part.state.status) {
          case "pending":
            await connection
              .sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "tool_call",
                  toolCallId: part.callID,
                  title: part.tool,
                  kind: toToolKind(part.tool),
                  status: "pending",
                  locations: [],
                  rawInput: {},
                },
              })
              .catch((error) => {
                log.error("failed to send tool pending to ACP", { error })
              })
            return

          case "running":
            await connection
              .sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "tool_call_update",
                  toolCallId: part.callID,
                  status: "in_progress",
                  kind: toToolKind(part.tool),
                  title: part.tool,
                  locations: toLocations(part.tool, part.state.input),
                  rawInput: part.state.input,
                },
              })
              .catch((error) => {
                log.error("failed to send tool in_progress to ACP", { error })
              })
            return

          case "completed": {
            const kind = toToolKind(part.tool)
            const content: ToolCallContent[] = [
              {
                type: "content",
                content: {
                  type: "text",
                  text: part.state.output,
                },
              },
            ]

            if (kind === "edit") {
              const input = part.state.input
              const filePath = typeof input["filePath"] === "string" ? input["filePath"] : ""
              const oldText = typeof input["oldString"] === "string" ? input["oldString"] : ""
              const newText =
                typeof input["newString"] === "string"
                  ? input["newString"]
                  : typeof input["content"] === "string"
                    ? input["content"]
                    : ""
              content.push({
                type: "diff",
                path: filePath,
                oldText,
                newText,
              })
            }

            if (part.tool === "todowrite") {
              const parsedTodos = z.array(Todo.Info).safeParse(JSON.parse(part.state.output))
              if (parsedTodos.success) {
                await connection
                  .sessionUpdate({
                    sessionId,
                    update: {
                      sessionUpdate: "plan",
                      entries: parsedTodos.data.map((todo) => {
                        const status: PlanEntry["status"] =
                          todo.status === "cancelled" ? "completed" : (todo.status as PlanEntry["status"])
                        return {
                          priority: "medium",
                          status,
                          content: todo.content,
                        }
                      }),
                    },
                  })
                  .catch((error) => {
                    log.error("failed to send session update for todo", { error })
                  })
              } else {
                log.error("failed to parse todo output", { error: parsedTodos.error })
              }
            }

            await connection
              .sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "tool_call_update",
                  toolCallId: part.callID,
                  status: "completed",
                  kind,
                  content,
                  title: part.state.title,
                  rawInput: part.state.input,
                  rawOutput: {
                    output: part.state.output,
                    metadata: part.state.metadata,
                  },
                },
              })
              .catch((error) => {
                log.error("failed to send tool completed to ACP", { error })
              })
            return
          }
          case "error":
            await connection
              .sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "tool_call_update",
                  toolCallId: part.callID,
                  status: "failed",
                  kind: toToolKind(part.tool),
                  title: part.tool,
                  rawInput: part.state.input,
                  content: [
                    {
                      type: "content",
                      content: {
                        type: "text",
                        text: part.state.error,
                      },
                    },
                  ],
                  rawOutput: {
                    error: part.state.error,
                  },
                },
              })
              .catch((error) => {
                log.error("failed to send tool error to ACP", { error })
              })
            return
        }
      }

      if (part.type === "text") {
        const delta = props.delta
        if (delta && part.ignored !== true) {
          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: delta,
                },
              },
            })
            .catch((error) => {
              log.error("failed to send text to ACP", { error })
            })
        }
        return
      }

      if (part.type === "reasoning") {
        const delta = props.delta
        if (delta) {
          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "agent_thought_chunk",
                content: {
                  type: "text",
                  text: delta,
                },
              },
            })
            .catch((error) => {
              log.error("failed to send reasoning to ACP", { error })
            })
        }
      }
      return
    }
  }
}

export async function newSession(this: ACPCore.Agent, params: NewSessionRequest) {
  const config = this.getConfig()
  const sdk = this.getSdk()
  const sessionManager = this.getSessionManager()

  const directory = params.cwd
  try {
    const model = await defaultModel(config, directory)

    // Store ACP session state
    const state = await sessionManager.create(params.cwd, params.mcpServers, model)
    const sessionId = state.id

    log.info("creating_session", { sessionId, mcpServers: params.mcpServers.length })

    const load = await loadSessionMode.call(this, {
      cwd: directory,
      mcpServers: params.mcpServers,
      sessionId,
    })

    return {
      sessionId,
      models: load.models,
      modes: load.modes,
      _meta: {},
    }
  } catch (e) {
    const error = MessageV2.fromError(e, {
      providerID: config.defaultModel?.providerID ?? "unknown",
    })
    if (LoadAPIKeyError.isInstance(error)) {
      throw RequestError.authRequired()
    }
    throw e
  }
}

export async function loadSession(this: ACPCore.Agent, params: LoadSessionRequest) {
  const config = this.getConfig()
  const sdk = this.getSdk()
  const sessionManager = this.getSessionManager()

  const directory = params.cwd
  const sessionId = params.sessionId

  try {
    const model = await defaultModel(config, directory)

    // Store ACP session state
    await sessionManager.load(sessionId, params.cwd, params.mcpServers, model)

    log.info("load_session", { sessionId, mcpServers: params.mcpServers.length })

    const result = await loadSessionMode.call(this, {
      cwd: directory,
      mcpServers: params.mcpServers,
      sessionId,
    })

    // Replay session history
    const messages = await sdk.session
      .messages(
        {
          sessionID: sessionId,
          directory,
        },
        { throwOnError: true },
      )
      .then((x) => x.data)
      .catch((err) => {
        log.error("unexpected error when fetching message", { error: err })
        return undefined
      })

    const lastUser = messages?.findLast((m) => m.info.role === "user")?.info
    if (lastUser?.role === "user") {
      result.models.currentModelId = `${lastUser.model.providerID}/${lastUser.model.modelID}`
      if (result.modes.availableModes.some((m) => m.id === lastUser.agent)) {
        result.modes.currentModeId = lastUser.agent
      }
    }

    for (const msg of messages ?? []) {
      log.debug("replay message", msg)
      await processMessage.call(this, msg)
    }

    return result
  } catch (e) {
    const error = MessageV2.fromError(e, {
      providerID: config.defaultModel?.providerID ?? "unknown",
    })
    if (LoadAPIKeyError.isInstance(error)) {
      throw RequestError.authRequired()
    }
    throw e
  }
}

async function processMessage(this: ACPCore.Agent, message: SessionMessageResponse) {
  const connection = this.getConnection()
  log.debug("process message", message)
  if (message.info.role !== "assistant" && message.info.role !== "user") return
  const sessionId = message.info.sessionID

  for (const part of message.parts) {
    if (part.type === "tool") {
      switch (part.state.status) {
        case "pending":
          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "tool_call",
                toolCallId: part.callID,
                title: part.tool,
                kind: toToolKind(part.tool),
                status: "pending",
                locations: [],
                rawInput: {},
              },
            })
            .catch((err) => {
              log.error("failed to send tool pending to ACP", { error: err })
            })
          break
        case "running":
          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                toolCallId: part.callID,
                status: "in_progress",
                kind: toToolKind(part.tool),
                title: part.tool,
                locations: toLocations(part.tool, part.state.input),
                rawInput: part.state.input,
              },
            })
            .catch((err) => {
              log.error("failed to send tool in_progress to ACP", { error: err })
            })
          break
        case "completed":
          const kind = toToolKind(part.tool)
          const content: ToolCallContent[] = [
            {
              type: "content",
              content: {
                type: "text",
                text: part.state.output,
              },
            },
          ]

          if (kind === "edit") {
            const input = part.state.input
            const filePath = typeof input["filePath"] === "string" ? input["filePath"] : ""
            const oldText = typeof input["oldString"] === "string" ? input["oldString"] : ""
            const newText =
              typeof input["newString"] === "string"
                ? input["newString"]
                : typeof input["content"] === "string"
                  ? input["content"]
                  : ""
            content.push({
              type: "diff",
              path: filePath,
              oldText,
              newText,
            })
          }

          if (part.tool === "todowrite") {
            const parsedTodos = z.array(Todo.Info).safeParse(JSON.parse(part.state.output))
            if (parsedTodos.success) {
              await connection
                .sessionUpdate({
                  sessionId,
                  update: {
                    sessionUpdate: "plan",
                    entries: parsedTodos.data.map((todo) => {
                      const status: PlanEntry["status"] =
                        todo.status === "cancelled" ? "completed" : (todo.status as PlanEntry["status"])
                      return {
                        priority: "medium",
                        status,
                        content: todo.content,
                      }
                    }),
                  },
                })
                .catch((err) => {
                  log.error("failed to send session update for todo", { error: err })
                })
            } else {
              log.error("failed to parse todo output", { error: parsedTodos.error })
            }
          }

          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                toolCallId: part.callID,
                status: "completed",
                kind,
                content,
                title: part.state.title,
                rawInput: part.state.input,
                rawOutput: {
                  output: part.state.output,
                  metadata: part.state.metadata,
                },
              },
            })
            .catch((err) => {
              log.error("failed to send tool completed to ACP", { error: err })
            })
          break
        case "error":
          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                toolCallId: part.callID,
                status: "failed",
                kind: toToolKind(part.tool),
                title: part.tool,
                rawInput: part.state.input,
                content: [
                  {
                    type: "content",
                    content: {
                      type: "text",
                      text: part.state.error,
                    },
                  },
                ],
                rawOutput: {
                  error: part.state.error,
                },
              },
            })
            .catch((err) => {
              log.error("failed to send tool error to ACP", { error: err })
            })
          break
      }
    } else if (part.type === "text") {
      if (part.text) {
        const audience: Role[] | undefined = part.synthetic ? ["assistant"] : part.ignored ? ["user"] : undefined
        await connection
          .sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: message.info.role === "user" ? "user_message_chunk" : "agent_message_chunk",
              content: {
                type: "text",
                text: part.text,
                ...(audience && { annotations: { audience } }),
              },
            },
          })
          .catch((err) => {
            log.error("failed to send text to ACP", { error: err })
          })
      }
    } else if (part.type === "file") {
      // Replay file attachments as appropriate ACP content blocks.
      const url = part.url
      const filename = part.filename ?? "file"
      const mime = part.mime || "application/octet-stream"
      const messageChunk = message.info.role === "user" ? "user_message_chunk" : "agent_message_chunk"

      if (url.startsWith("file:/")) {
        // Local file reference - send as resource_link
        await connection
          .sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: messageChunk,
              content: { type: "resource_link", uri: url, name: filename, mimeType: mime },
            },
          })
          .catch((err) => {
            log.error("failed to send resource_link to ACP", { error: err })
          })
      } else if (url.startsWith("data:")) {
        // Embedded content - parse data URL and send as appropriate block type
        const base64Match = url.match(/^data:([^;]+);base64,(.*)$/)
        const dataMime = base64Match?.[1]
        const base64Data = base64Match?.[2] ?? ""

        const effectiveMime = dataMime || mime

        if (effectiveMime.startsWith("image/")) {
          // Image - send as image block
          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: messageChunk,
                content: {
                  type: "image",
                  mimeType: effectiveMime,
                  data: base64Data,
                  uri: `file:/${filename}`,
                },
              },
            })
            .catch((err) => {
              log.error("failed to send image to ACP", { error: err })
            })
        } else {
          // Non-image: text types get decoded, binary types stay as blob
          const isText = effectiveMime.startsWith("text/") || effectiveMime === "application/json"
          const resource = isText
            ? {
                uri: `file:/${filename}`,
                mimeType: effectiveMime,
                text: Buffer.from(base64Data, "base64").toString("utf-8"),
              }
            : { uri: `file:/${filename}`, mimeType: effectiveMime, blob: base64Data }

          await connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: messageChunk,
                content: { type: "resource", resource },
              },
            })
            .catch((err) => {
              log.error("failed to send resource to ACP", { error: err })
            })
        }
      }
      // URLs that don't match file:/ or data: are skipped (unsupported)
    } else if (part.type === "reasoning") {
      if (part.text) {
        await connection
          .sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: {
                type: "text",
                text: part.text,
              },
            },
          })
          .catch((err) => {
            log.error("failed to send reasoning to ACP", { error: err })
          })
      }
    }
  }
}

async function loadSessionMode(this: ACPCore.Agent, params: LoadSessionRequest) {
  const config = this.getConfig()
  const sdk = this.getSdk()
  const sessionManager = this.getSessionManager()
  const connection = this.getConnection()

  const directory = params.cwd
  const model = await defaultModel(config, directory)
  const sessionId = params.sessionId

  const providers = await sdk.config.providers({ directory }).then((x) => x.data!.providers)
  const entries = providers.sort((a, b) => {
    const nameA = a.name.toLowerCase()
    const nameB = b.name.toLowerCase()
    if (nameA < nameB) return -1
    if (nameA > nameB) return 1
    return 0
  })
  const availableModels = entries.flatMap((provider) => {
    const models = Provider.sort(Object.values(provider.models))
    return models.map((model) => ({
      modelId: `${provider.id}/${model.id}`,
      name: `${provider.name}/${model.name}`,
    }))
  })

  const agents = await config.sdk.app
    .agents(
      {
        directory,
      },
      { throwOnError: true },
    )
    .then((resp) => resp.data!)

  const commands = await config.sdk.command
    .list(
      {
        directory,
      },
      { throwOnError: true },
    )
    .then((resp) => resp.data!)

  const availableCommands = commands.map((command) => ({
    name: command.name,
    description: command.description ?? "",
  }))
  const names = new Set(availableCommands.map((c) => c.name))
  if (!names.has("compact"))
    availableCommands.push({
      name: "compact",
      description: "compact the session",
    })

  const availableModes = agents
    .filter((agent) => agent.mode !== "subagent" && !agent.hidden)
    .map((agent) => ({
      id: agent.name,
      name: agent.name,
      description: agent.description,
    }))

  const defaultAgentName = await AgentModule.defaultAgent()
  const currentModeId = availableModes.find((m) => m.name === defaultAgentName)?.id ?? availableModes[0].id

  // Persist the default mode so prompt() uses it immediately
  sessionManager.setMode(sessionId, currentModeId)

  const mcpServers: Record<string, Config.Mcp> = {}
  for (const server of params.mcpServers) {
    if ("type" in server) {
      mcpServers[server.name] = {
        url: server.url,
        headers: server.headers.reduce<Record<string, string>>((acc, { name, value }) => {
          acc[name] = value
          return acc
        }, {}),
        type: "remote",
      }
    } else {
      mcpServers[server.name] = {
        type: "local",
        command: [server.command, ...server.args],
        environment: server.env.reduce<Record<string, string>>((acc, { name, value }) => {
          acc[name] = value
          return acc
        }, {}),
      }
    }
  }

  await Promise.all(
    Object.entries(mcpServers).map(async ([key, mcp]) => {
      await sdk.mcp
        .add(
          {
            directory,
            name: key,
            config: mcp,
          },
          { throwOnError: true },
        )
        .catch((error) => {
          log.error("failed to add mcp server", { name: key, error })
        })
    }),
  )

  setTimeout(() => {
    connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands,
      },
    })
  }, 0)

  return {
    sessionId,
    models: {
      currentModelId: `${model.providerID}/${model.modelID}`,
      availableModels,
    },
    modes: {
      availableModes,
      currentModeId,
    },
    _meta: {},
  }
}

export async function setSessionModel(this: ACPCore.Agent, params: SetSessionModelRequest) {
  const sessionManager = this.getSessionManager()
  const session = sessionManager.get(params.sessionId)

  const model = Provider.parseModel(params.modelId)

  sessionManager.setModel(session.id, {
    providerID: model.providerID,
    modelID: model.modelID,
  })

  return {
    _meta: {},
  }
}

export async function setSessionMode(
  this: ACPCore.Agent,
  params: SetSessionModeRequest,
): Promise<SetSessionModeResponse | void> {
  const config = this.getConfig()
  const sessionManager = this.getSessionManager()
  sessionManager.get(params.sessionId)
  await config.sdk.app
    .agents({}, { throwOnError: true })
    .then((x) => x.data)
    .then((agent) => {
      if (!agent) throw new Error(`Agent not found: ${params.modeId}`)
    })
  sessionManager.setMode(params.sessionId, params.modeId)
}

function getNewContent(fileOriginal: string, unifiedDiff: string): string | undefined {
  const result = applyPatch(fileOriginal, unifiedDiff)
  if (result === false) {
    log.error("Failed to apply unified diff (context mismatch)")
    return undefined
  }
  return result
}
