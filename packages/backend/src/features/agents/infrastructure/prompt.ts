/**
 * Prompt: Main entry point and barrel export
 * Purpose: Core prompt loop logic and public API exports
 */

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

import { Identifier } from "../../../shared/utils/id/id"
import { MessageV2 } from "./message-v2"
import { Log } from "../../../shared/utils/log"
import { SessionRevert } from "./revert"
import { Session } from "."
import { Agent } from "../services/AgentExecutor"
import { Provider } from "../../providers/services/provider"
import { SessionCompaction } from "./compaction"
import { Instance } from "../../../core/instance"
import { SystemPrompt } from "./system"
import { Plugin } from "../../plugins/services"
import MAX_STEPS from "../../agents/infrastructure/prompt/max-steps.txt"
import { defer } from "../../../shared/utils/defer"
import { clone } from "remeda"
import { ulid } from "ulid"
import { SessionSummary } from "./summary"
import { fn } from "../../../shared/utils/fn"
import { SessionProcessor } from "./processor"
import { TaskTool } from "../../tools/native/task"
import { Tool } from "../../tools/domain/Tool"
import { PermissionNext } from "../../permissions/services/next"
import { SessionStatus } from "./status"
import z from "zod"

// Import from split files
import * as Builder from "./prompt-builder"
import * as Templates from "./prompt-templates"
import { ensureTitle as formatTitle } from "./prompt-formatters"
import { resolveTools as getTools, createUserMessage as makeUserMessage } from "./prompt-context"
import { Flag } from "../../../shared/config/flags/flag"

const log = Log.create({ service: "session.prompt" })
export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

export const prompt = fn(Builder.PromptInput, async (input) => {
  const session = await Session.get(input.sessionID)
  await SessionRevert.cleanup(session)

  const message = await makeUserMessage(input)
  await Session.touch(input.sessionID)

  // this is backwards compatibility for allowing `tools` to be specified when
  // prompting
  const permissions: PermissionNext.Ruleset = []
  for (const [tool, enabled] of Object.entries(input.tools ?? {})) {
    permissions.push({
      permission: tool,
      action: enabled ? "allow" : "deny",
      pattern: "*",
    })
  }
  if (permissions.length > 0) {
    session.permission = permissions
    await Session.update(session.id, (draft) => {
      draft.permission = permissions
    })
  }

  if (input.noReply === true) {
    return message
  }

  return loop(input.sessionID)
})

export const loop = fn(Identifier.schema("session"), async (sessionID) => {
  const abort = Builder.start(sessionID)
  if (!abort) {
    return new Promise<MessageV2.WithParts>((resolve, reject) => {
      const callbacks = Builder.state()[sessionID].callbacks
      callbacks.push({ resolve, reject })
    })
  }

  using _ = defer(() => Builder.cancel(sessionID))

  let step = 0
  const session = await Session.get(sessionID)
  while (true) {
    SessionStatus.set(sessionID, { type: "busy" })
    log.info("loop", { step, sessionID })
    if (abort.aborted) break
    let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

    let lastUser: MessageV2.User | undefined
    let lastAssistant: MessageV2.Assistant | undefined
    let lastFinished: MessageV2.Assistant | undefined
    let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
      if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
      if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
        lastFinished = msg.info as MessageV2.Assistant
      if (lastUser && lastFinished) break
      const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
      if (task && !lastFinished) {
        tasks.push(...task)
      }
    }

    if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
    if (
      lastAssistant?.finish &&
      !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
      lastUser.id < lastAssistant.id
    ) {
      log.info("exiting loop", { sessionID })
      break
    }

    step++
    if (step === 1)
      formatTitle({
        session,
        modelID: lastUser.model.modelID,
        providerID: lastUser.model.providerID,
        history: msgs,
      })

    const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
    const task = tasks.pop()

    // pending subtask
    // TODO: centralize "invoke tool" logic
    if (task?.type === "subtask") {
      const taskTool = await TaskTool.init()
      const taskModel = task.model ? await Provider.getModel(task.model.providerID, task.model.modelID) : model
      const assistantMessage = (await Session.updateMessage({
        id: Identifier.ascending("message"),
        role: "assistant",
        parentID: lastUser.id,
        sessionID,
        mode: task.agent,
        agent: task.agent,
        path: {
          cwd: Instance.directory,
          root: Instance.worktree,
        },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        modelID: taskModel.id,
        providerID: taskModel.providerID,
        time: {
          created: Date.now(),
        },
      })) as MessageV2.Assistant
      let part = (await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: assistantMessage.id,
        sessionID: assistantMessage.sessionID,
        type: "tool",
        callID: ulid(),
        tool: TaskTool.id,
        state: {
          status: "running",
          input: {
            prompt: task.prompt,
            description: task.description,
            subagent_type: task.agent,
            command: task.command,
          },
          time: {
            start: Date.now(),
          },
        },
      })) as MessageV2.ToolPart
      const taskArgs = {
        prompt: task.prompt,
        description: task.description,
        subagent_type: task.agent,
        command: task.command,
      }
      await Plugin.trigger(
        "tool.execute.before",
        {
          tool: "task",
          sessionID,
          callID: part.id,
        },
        { args: taskArgs },
      )
      let executionError: Error | undefined
      const taskAgent = await Agent.get(task.agent)
      const taskCtx: Tool.Context = {
        agent: task.agent,
        messageID: assistantMessage.id,
        sessionID: sessionID,
        abort,
        callID: part.callID,
        extra: { bypassAgentCheck: true },
        async metadata(input) {
          await Session.updatePart({
            ...part,
            type: "tool",
            state: {
              ...part.state,
              ...input,
            },
          } satisfies MessageV2.ToolPart)
        },
        async ask(req) {
          await PermissionNext.ask({
            ...req,
            sessionID: sessionID,
            ruleset: PermissionNext.merge(taskAgent.permission, session.permission ?? []),
          })
        },
      }
      const result = await taskTool.execute(taskArgs, taskCtx).catch((error) => {
        executionError = error
        log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
        return undefined
      })
      await Plugin.trigger(
        "tool.execute.after",
        {
          tool: "task",
          sessionID,
          callID: part.id,
        },
        result,
      )
      assistantMessage.finish = "tool-calls"
      assistantMessage.time.completed = Date.now()
      await Session.updateMessage(assistantMessage)
      if (result && part.state.status === "running") {
        await Session.updatePart({
          ...part,
          state: {
            status: "completed",
            input: part.state.input,
            title: result.title,
            metadata: result.metadata,
            output: result.output,
            attachments: result.attachments,
            time: {
              ...part.state.time,
              end: Date.now(),
            },
          },
        } satisfies MessageV2.ToolPart)
      }
      if (!result) {
        await Session.updatePart({
          ...part,
          state: {
            status: "error",
            error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
            time: {
              start: part.state.status === "running" ? part.state.time.start : Date.now(),
              end: Date.now(),
            },
            metadata: part.metadata,
            input: part.state.input,
          },
        } satisfies MessageV2.ToolPart)
      }

      // Add synthetic user message to prevent certain reasoning models from erroring
      // If we create assistant messages w/ out user ones following mid loop thinking signatures
      // will be missing and it can cause errors for models like gemini for example
      const summaryUserMsg: MessageV2.User = {
        id: Identifier.ascending("message"),
        sessionID,
        role: "user",
        time: {
          created: Date.now(),
        },
        agent: lastUser.agent,
        model: lastUser.model,
      }
      await Session.updateMessage(summaryUserMsg)
      await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: summaryUserMsg.id,
        sessionID,
        type: "text",
        text: "Summarize the task tool output above and continue with your task.",
        synthetic: true,
      } satisfies MessageV2.TextPart)

      continue
    }

    // pending compaction
    if (task?.type === "compaction") {
      const result = await SessionCompaction.process({
        messages: msgs,
        parentID: lastUser.id,
        abort,
        sessionID,
        auto: task.auto,
      })
      if (result === "stop") break
      continue
    }

    // context overflow, needs compaction
    if (
      lastFinished &&
      lastFinished.summary !== true &&
      (await SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model }))
    ) {
      await SessionCompaction.create({
        sessionID,
        agent: lastUser.agent,
        model: lastUser.model,
        auto: true,
      })
      continue
    }

    // normal processing
    const agent = await Agent.get(lastUser.agent)
    const maxSteps = agent.steps ?? Infinity
    const isLastStep = step >= maxSteps
    msgs = await Builder.insertReminders({
      messages: msgs,
      agent,
      session,
    })

    const processor = SessionProcessor.create({
      assistantMessage: (await Session.updateMessage({
        id: Identifier.ascending("message"),
        parentID: lastUser.id,
        role: "assistant",
        mode: agent.name,
        agent: agent.name,
        path: {
          cwd: Instance.directory,
          root: Instance.worktree,
        },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        modelID: model.id,
        providerID: model.providerID,
        time: {
          created: Date.now(),
        },
        sessionID,
      })) as MessageV2.Assistant,
      sessionID: sessionID,
      model,
      abort,
    })

    // Check if user explicitly invoked an agent via @ in this turn
    const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
    const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false

    const tools = await getTools({
      agent,
      session,
      model,
      tools: lastUser.tools,
      processor,
      bypassAgentCheck,
    })

    if (step === 1) {
      SessionSummary.summarize({
        sessionID: sessionID,
        messageID: lastUser.id,
      })
    }

    const sessionMessages = clone(msgs)

    // Ephemerally wrap queued user messages with a reminder to stay on track
    if (step > 1 && lastFinished) {
      for (const msg of sessionMessages) {
        if (msg.info.role !== "user" || msg.info.id <= lastFinished.id) continue
        for (const part of msg.parts) {
          if (part.type !== "text" || part.ignored || part.synthetic) continue
          if (!part.text.trim()) continue
          part.text = [
            "<system-reminder>",
            "The user sent the following message:",
            part.text,
            "",
            "Please address this message and continue with your tasks.",
            "</system-reminder>",
          ].join("\n")
        }
      }
    }

    await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: sessionMessages })

    const result = await processor.process({
      user: lastUser,
      agent,
      abort,
      sessionID,
      system: [...(await SystemPrompt.environment()), ...(await SystemPrompt.custom())],
      messages: [
        ...MessageV2.toModelMessages(sessionMessages, model),
        ...(isLastStep
          ? [
              {
                role: "assistant" as const,
                content: MAX_STEPS,
              },
            ]
          : []),
      ],
      tools,
      model,
    })
    if (result === "stop") break
    if (result === "compact") {
      await SessionCompaction.create({
        sessionID,
        agent: lastUser.agent,
        model: lastUser.model,
        auto: true,
      })
    }
    continue
  }
  SessionCompaction.prune({ sessionID })
  for await (const item of MessageV2.stream(sessionID)) {
    if (item.info.role === "user") continue
    const queued = Builder.state()[sessionID]?.callbacks ?? []
    for (const q of queued) {
      q.resolve(item)
    }
    return item
  }
  throw new Error("Impossible")
})

// Re-export all public APIs
export { assertNotBusy, PromptInput, resolvePromptParts, start, cancel, lastModel, insertReminders } from "./prompt-builder"
export { shell, ShellInput, command, CommandInput } from "./prompt-templates"
export { ensureTitle } from "./prompt-formatters"
export { resolveTools, createUserMessage } from "./prompt-context"
export type { PromptInput as PromptInputType } from "./prompt-builder"
export type { ShellInput as ShellInputType, CommandInput as CommandInputType } from "./prompt-templates"

// Store references to outer scope functions for namespace export
const promptFn = prompt
const loopFn = loop

// Namespace export for backward compatibility
export namespace SessionPrompt {
  export const log = Log.create({ service: "session.prompt" })
  export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000
  export const assertNotBusy = Builder.assertNotBusy
  export const PromptInput = Builder.PromptInput
  export type PromptInput = z.infer<typeof Builder.PromptInput>
  export const prompt = promptFn
  export const resolvePromptParts = Builder.resolvePromptParts
  export const start = Builder.start
  export const cancel = Builder.cancel
  export const loop = loopFn
  export const lastModel = Builder.lastModel
  export const insertReminders = Builder.insertReminders
  export const ShellInput = Templates.ShellInput
  export type ShellInput = z.infer<typeof Templates.ShellInput>
  export const shell = Templates.shell
  export const CommandInput = Templates.CommandInput
  export type CommandInput = z.infer<typeof Templates.CommandInput>
  export const command = Templates.command
  export const ensureTitle = formatTitle
  export const resolveTools = getTools
  export const createUserMessage = makeUserMessage
}

