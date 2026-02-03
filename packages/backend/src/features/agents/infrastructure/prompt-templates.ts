/**
 * Prompt Templates: Template definitions, command handling, and shell execution
 * Purpose: Command parsing, template processing, and shell command execution
 */

import path from "path"
import z from "zod"
import { Identifier } from "../../../shared/utils/id/id"
import { MessageV2 } from "./message-v2"
import { Log } from "../../../shared/utils/log"
import { Session } from "."
import { Agent } from "../services/AgentExecutor"
import { Provider } from "../../providers/services/provider"
import { Plugin } from "../../plugins/services"
import { ulid } from "ulid"
import { spawn } from "child_process"
import { $ } from "bun"
import { ConfigMarkdown } from "../../../shared/config/markdown"
import { NamedError } from "@opencode-ai/util"
import { Bus } from "../../../core/bus"
import { Instance } from "../../../core/instance"
import { Shell } from "../../../infrastructure/shell/shell"
import { defer } from "../../../shared/utils/defer"
import { lastModel, start, cancel, resolvePromptParts } from "./prompt-builder"
import { SessionStatus } from "./status"

const log = Log.create({ service: "session.prompt" })

export const ShellInput = z.object({
  sessionID: Identifier.schema("session"),
  agent: z.string(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  command: z.string(),
})
export type ShellInput = z.infer<typeof ShellInput>

export async function shell(input: ShellInput) {
  const abort = start(input.sessionID)
  if (!abort) {
    throw new Session.BusyError(input.sessionID)
  }
  using _ = defer(() => cancel(input.sessionID))

  const session = await Session.get(input.sessionID)
  const agent = await Agent.get(input.agent)
  if (!agent) throw new Error(`Agent not found: ${input.agent}`)
  const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
  const userMsg: MessageV2.User = {
    id: Identifier.ascending("message"),
    sessionID: input.sessionID,
    time: {
      created: Date.now(),
    },
    role: "user",
    agent: input.agent,
    model: {
      providerID: model.providerID,
      modelID: model.modelID,
    },
  }
  await Session.updateMessage(userMsg)
  const userPart: MessageV2.Part = {
    type: "text",
    id: Identifier.ascending("part"),
    messageID: userMsg.id,
    sessionID: input.sessionID,
    text: "The following tool was executed by the user",
    synthetic: true,
  }
  await Session.updatePart(userPart)

  const msg: MessageV2.Assistant = {
    id: Identifier.ascending("message"),
    sessionID: input.sessionID,
    parentID: userMsg.id,
    mode: input.agent,
    agent: input.agent,
    cost: 0,
    path: {
      cwd: Instance.directory,
      root: Instance.worktree,
    },
    time: {
      created: Date.now(),
    },
    role: "assistant",
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: model.modelID,
    providerID: model.providerID,
  }
  await Session.updateMessage(msg)
  const part: MessageV2.Part = {
    type: "tool",
    id: Identifier.ascending("part"),
    messageID: msg.id,
    sessionID: input.sessionID,
    tool: "bash",
    callID: ulid(),
    state: {
      status: "running",
      time: {
        start: Date.now(),
      },
      input: {
        command: input.command,
      },
    },
  }
  await Session.updatePart(part)
  const shell = Shell.preferred()
  const shellName = (
    process.platform === "win32" ? path.win32.basename(shell, ".exe") : path.basename(shell)
  ).toLowerCase()

  const invocations: Record<string, { args: string[] }> = {
    nu: {
      args: ["-c", input.command],
    },
    fish: {
      args: ["-c", input.command],
    },
    zsh: {
      args: [
        "-c",
        "-l",
        `
          [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
          [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
          eval ${JSON.stringify(input.command)}
        `,
      ],
    },
    bash: {
      args: [
        "-c",
        "-l",
        `
          shopt -s expand_aliases
          [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
          eval ${JSON.stringify(input.command)}
        `,
      ],
    },
    // Windows cmd
    cmd: {
      args: ["/c", input.command],
    },
    // Windows PowerShell
    powershell: {
      args: ["-NoProfile", "-Command", input.command],
    },
    pwsh: {
      args: ["-NoProfile", "-Command", input.command],
    },
    // Fallback: any shell that doesn't match those above
    // - No -l, for max compatibility
    "": {
      args: ["-c", `${input.command}`],
    },
  }

  const matchingInvocation = invocations[shellName] ?? invocations[""]
  const args = matchingInvocation?.args ?? []

  const proc = spawn(shell, args as any, {
    cwd: Instance.directory,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      TERM: "dumb",
    },
  })

  let output = ""

  (proc as any).stdout?.on("data", (chunk: any) => {
    output += chunk.toString()
    if (part.state.status === "running") {
      part.state.metadata = {
        output: output,
        description: "",
      }
      Session.updatePart(part)
    }
  })

  (proc as any).stderr?.on("data", (chunk: any) => {
    output += chunk.toString()
    if (part.state.status === "running") {
      part.state.metadata = {
        output: output,
        description: "",
      }
      Session.updatePart(part)
    }
  })

  let aborted = false
  let exited = false

  const kill = () => Shell.killTree(proc, { exited: () => exited })

  if (abort.aborted) {
    aborted = true
    await kill()
  }

  const abortHandler = () => {
    aborted = true
    void kill()
  }

  abort.addEventListener("abort", abortHandler, { once: true })

  await new Promise<void>((resolve) => {
    (proc as any).on("close", () => {
      exited = true
      abort.removeEventListener("abort", abortHandler)
      resolve()
    })
  })

  if (aborted) {
    output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
  }
  msg.time.completed = Date.now()
  await Session.updateMessage(msg)
  if (part.state.status === "running") {
    part.state = {
      status: "completed",
      time: {
        ...part.state.time,
        end: Date.now(),
      },
      input: part.state.input,
      title: "",
      metadata: {
        output,
        description: "",
      },
      output,
    }
    await Session.updatePart(part)
  }
  return { info: msg, parts: [part] }
}

export const CommandInput = z.object({
  messageID: Identifier.schema("message").optional(),
  sessionID: Identifier.schema("session"),
  agent: z.string().optional(),
  model: z.string().optional(),
  arguments: z.string(),
  command: z.string(),
  variant: z.string().optional(),
  parts: z
    .array(
      z.discriminatedUnion("type", [
        MessageV2.FilePart.omit({
          messageID: true,
          sessionID: true,
        }).partial({
          id: true,
        }),
      ]),
    )
    .optional(),
})
export type CommandInput = z.infer<typeof CommandInput>

const bashRegex = /!`([^`]+)`/g
const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const placeholderRegex = /\$(\d+)/g
const quoteTrimRegex = /^["']|["']$/g

export async function command(input: CommandInput) {
  log.info("command", input)
  // Import Command dynamically to avoid circular dependency
  const CommandModule = await import("../../cli/services/command").catch(() => ({ Command: undefined }))
  if (!CommandModule.Command) throw new Error("Command service not available")
  const command = await CommandModule.Command.get(input.command)
  const agentName = command.agent ?? input.agent ?? (await Agent.defaultAgent())

  const raw = input.arguments.match(argsRegex) ?? []
  const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))

  const templateCommand = await command.template

  const placeholders = templateCommand.match(placeholderRegex) ?? []
  let last = 0
  for (const item of placeholders) {
    const value = Number(item.slice(1))
    if (value > last) last = value
  }

  // Let the final placeholder swallow any extra arguments so prompts read naturally
  const withArgs = templateCommand.replaceAll(placeholderRegex, (_: any, index: any) => {
    const position = Number(index)
    const argIndex = position - 1
    if (argIndex >= args.length) return ""
    if (position === last) return args.slice(argIndex).join(" ")
    return args[argIndex]
  })
  const usesArgumentsPlaceholder = templateCommand.includes("$ARGUMENTS")
  let template = withArgs.replaceAll("$ARGUMENTS", input.arguments)

  // If command doesn't explicitly handle arguments (no $N or $ARGUMENTS placeholders)
  // but user provided arguments, append them to the template
  if (placeholders.length === 0 && !usesArgumentsPlaceholder && input.arguments.trim()) {
    template = template + "\n\n" + input.arguments
  }

  const shellCmds = ConfigMarkdown.shell(template)
  if (shellCmds.length > 0) {
    const results = await Promise.all(
      shellCmds.map(async ([, cmd]) => {
        try {
          return await $`${{ raw: cmd }}`.quiet().nothrow().text()
        } catch (error) {
          return `Error executing command: ${error instanceof Error ? error.message : String(error)}`
        }
      }),
    )
    let index = 0
    template = template.replace(bashRegex, () => results[index++])
  }
  template = template.trim()

  const taskModel = await (async () => {
    if (command.model) {
      return Provider.parseModel(command.model)
    }
    if (command.agent) {
      const cmdAgent = await Agent.get(command.agent)
      if (cmdAgent?.model) {
        return cmdAgent.model
      }
    }
    if (input.model) return Provider.parseModel(input.model)
    return await lastModel(input.sessionID)
  })()

  try {
    await Provider.getModel(taskModel.providerID, taskModel.modelID)
  } catch (e: any) {
    if (e && typeof e === 'object' && 'data' in e && e.data) {
      const { providerID, modelID, suggestions } = e.data
      const hint = suggestions?.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""
      Bus.publish(Session.Event.Error, {
        sessionID: input.sessionID,
        error: (new NamedError.Unknown({ message: `Model not found: ${providerID}/${modelID}.${hint}` }) as any).toObject(),
      })
    }
    throw e
  }
  const agent = await Agent.get(agentName)
  if (!agent) {
    const available = await Agent.list().then((agents) => agents.filter((a) => !a.hidden).map((a) => a.name))
    const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
    const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
    Bus.publish(Session.Event.Error, {
      sessionID: input.sessionID,
      error: (error as any).toObject(),
    })
    throw error
  }

  const templateParts = await resolvePromptParts(template)
  const isSubtask = (agent.mode === "subagent" && command.subtask !== false) || command.subtask === true
  const parts = isSubtask
    ? [
        {
          type: "subtask" as const,
          agent: agent.name,
          description: command.description ?? "",
          command: input.command,
          model: {
            providerID: taskModel.providerID,
            modelID: taskModel.modelID,
          },
          // TODO: how can we make task tool accept a more complex input?
          prompt: templateParts.find((y) => y.type === "text")?.text ?? "",
        },
      ]
    : [...templateParts, ...(input.parts ?? [])]

  const userAgent = isSubtask ? (input.agent ?? (await Agent.defaultAgent())) : agentName
  const userModel = isSubtask
    ? input.model
      ? Provider.parseModel(input.model)
      : await lastModel(input.sessionID)
    : taskModel

  await Plugin.trigger(
    "command.execute.before",
    {
      command: input.command,
      sessionID: input.sessionID,
      arguments: input.arguments,
    },
    { parts },
  )

  // Import prompt function dynamically to avoid circular dependency
  const { prompt } = await import("./prompt")
  const result = (await prompt({
    sessionID: input.sessionID,
    messageID: input.messageID,
    model: userModel,
    agent: userAgent,
    parts,
    variant: input.variant,
  })) as MessageV2.WithParts

  // Import Command dynamically
  const CmdModule = await import("../../cli/services/command").catch(() => ({ Command: undefined }))
  if (CmdModule.Command) {
    Bus.publish((CmdModule.Command as any).Event.Executed, {
    name: input.command,
    sessionID: input.sessionID,
    arguments: input.arguments,
    messageID: result.info.id,
  })
  }

  return result
}
