/**
 * Prompt Builder: Main PromptBuilder class and message construction logic
 * Purpose: Core prompt building and user message creation
 */

import path from "path"
import os from "os"
import fs from "fs/promises"
import z from "zod"
import { Identifier } from "../../../shared/utils/id/id"
import { MessageV2 } from "./message-v2"
import { Log } from "../../../shared/utils/log"
import { Session } from "."
import { Agent } from "../services/AgentExecutor"
import { Provider } from "../../providers/services/provider"
import { Plugin } from "../../plugins/services"
import { defer } from "../../../shared/utils/defer"
import { Instance } from "../../../core/instance"
import { ConfigMarkdown } from "../../../shared/config/markdown"
import { fn } from "../../../shared/utils/fn"
import { PermissionNext } from "../../permissions/services/next"
import { SessionStatus } from "./status"
import { Flag } from "../../../shared/config/flags/flag"
import PROMPT_PLAN from "../../agents/infrastructure/prompt/plan.txt"
import BUILD_SWITCH from "../../agents/infrastructure/prompt/build-switch.txt"

const log = Log.create({ service: "session.prompt" })

const state = Instance.state(
  () => {
    const data: Record<
      string,
      {
        abort: AbortController
        callbacks: {
          resolve(input: MessageV2.WithParts): void
          reject(): void
        }[]
      }
    > = {}
    return data
  },
  async (current) => {
    for (const item of Object.values(current)) {
      item.abort.abort()
      for (const callback of item.callbacks) {
        callback.reject()
      }
    }
  },
)

export function assertNotBusy(sessionID: string) {
  const match = state()[sessionID]
  if (match) throw new Session.BusyError(sessionID)
}

export const PromptInput = z.object({
  sessionID: Identifier.schema("session"),
  messageID: Identifier.schema("message").optional(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  agent: z.string().optional(),
  noReply: z.boolean().optional(),
  tools: z
    .record(z.string(), z.boolean())
    .optional()
    .describe(
      "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
    ),
  system: z.string().optional(),
  variant: z.string().optional(),
  parts: z.array(
    z.discriminatedUnion("type", [
      MessageV2.TextPart.omit({
        messageID: true,
        sessionID: true,
      })
        .partial({
          id: true,
        })
        .meta({
          ref: "TextPartInput",
        }),
      MessageV2.FilePart.omit({
        messageID: true,
        sessionID: true,
      })
        .partial({
          id: true,
        })
        .meta({
          ref: "FilePartInput",
        }),
      MessageV2.AgentPart.omit({
        messageID: true,
        sessionID: true,
      })
        .partial({
          id: true,
        })
        .meta({
          ref: "AgentPartInput",
        }),
      MessageV2.SubtaskPart.omit({
        messageID: true,
        sessionID: true,
      })
        .partial({
          id: true,
        })
        .meta({
          ref: "SubtaskPartInput",
        }),
    ]),
  ),
})
export type PromptInput = z.infer<typeof PromptInput>

export async function resolvePromptParts(template: string): Promise<PromptInput["parts"]> {
  const parts: PromptInput["parts"] = [
    {
      type: "text",
      text: template,
    },
  ]
  const files = ConfigMarkdown.files(template)
  const seen = new Set<string>()
  await Promise.all(
    files.map(async (match) => {
      const name = match[1]
      if (!name) return
      if (seen.has(name)) return
      seen.add(name)
      const filepath = name.startsWith("~/")
        ? path.join(os.homedir(), name.slice(2))
        : path.resolve(Instance.worktree, name)

      const stats = await fs.stat(filepath).catch(() => undefined)
      if (!stats) {
        const agent = await Agent.get(name)
        if (agent) {
          parts.push({
            type: "agent",
            name: agent.name,
          })
        }
        return
      }

      if (stats.isDirectory()) {
        parts.push({
          type: "file",
          url: `file:/${filepath}`,
          filename: name,
          mime: "application/x-directory",
        })
        return
      }

      parts.push({
        type: "file",
        url: `file:/${filepath}`,
        filename: name,
        mime: "text/plain",
      })
    }),
  )
  return parts
}

export function start(sessionID: string) {
  const s = state()
  if (s[sessionID]) return
  const controller = new AbortController()
  s[sessionID] = {
    abort: controller,
    callbacks: [],
  }
  return controller.signal
}

export function cancel(sessionID: string) {
  log.info("cancel", { sessionID })
  const s = state()
  const match = s[sessionID]
  if (!match) return
  match.abort.abort()
  for (const item of match.callbacks) {
    item.reject()
  }
  delete s[sessionID]
  SessionStatus.set(sessionID, { type: "idle" })
  return
}

export async function lastModel(sessionID: string) {
  for await (const item of MessageV2.stream(sessionID) as any) {
    if (item.info.role === "user" && item.info.model) return item.info.model
  }
  return Provider.defaultModel()
}

export async function insertReminders(input: {
  messages: MessageV2.WithParts[]
  agent: Agent.Info
  session: Session.Info
}) {
  const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
  if (!userMessage) return input.messages

  // Original logic when experimental plan mode is disabled
  if (!Flag.OPENCODE_EXPERIMENTAL_PLAN_MODE) {
    if (input.agent.name === "plan") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: PROMPT_PLAN,
        synthetic: true,
      })
    }
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: BUILD_SWITCH,
        synthetic: true,
      })
    }
    return input.messages
  }

  // New plan mode logic when flag is enabled
  const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")

  // Switching from plan mode to build mode
  if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
    const plan = Session.plan(input.session)
    const exists = await Bun.file(plan).exists()
    if (exists) {
      const part = await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text:
          BUILD_SWITCH + "\n\n" + `A plan file exists at ${plan}. You should execute on the plan defined within it`,
        synthetic: true,
      }) as MessageV2.Part
      userMessage.parts.push(part)
    }
    return input.messages
  }

  // Entering plan mode
  if (input.agent.name === "plan" && assistantMessage?.info.agent !== "plan") {
    const plan = Session.plan(input.session)
    const exists = await Bun.file(plan).exists()
    if (!exists) await fs.mkdir(path.dirname(plan), { recursive: true })
    const part = await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: userMessage.info.id,
      sessionID: userMessage.info.sessionID,
      type: "text",
      text: `<system-reminder>
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received.

## Plan File Info:
${exists ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.` : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`}
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions. Critical: In this phase you should only use the explore subagent type.

1. Focus on understanding the user's request and the code associated with their request

2. **Launch up to 3 explore agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - 3 agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigates testing patterns

3. After exploring the code, use the question tool to clarify ambiguities in the user request up front.

### Phase 2: Design
Goal: Design an implementation approach.

Launch general agent(s) to design the implementation based on the user's intent and your exploration results from Phase 1.

You can launch up to 1 agent(s) in parallel.

**Guidelines:**
- **Default**: Launch at least 1 Plan agent for most tasks - it helps validate your understanding and consider alternatives
- **Skip agents**: Only for truly trivial tasks (typo fixes, single-line changes, simple renames)

Examples of when to use multiple agents:
- The task touches multiple parts of the codebase
- It's a large refactor or architectural change
- There are many edge cases to consider
- You'd benefit from exploring different approaches

Example perspectives by task type:
- New feature: simplicity vs performance vs maintainability
- Bug fix: root cause vs workaround vs prevention
- Refactoring: minimal change vs clean architecture

In the agent prompt:
- Provide comprehensive background context from Phase 1 exploration including filenames and code path traces
- Describe requirements and constraints
- Request a detailed implementation plan

### Phase 3: Review
Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.
1. Read the critical files identified by agents to deepen your understanding
2. Ensure that the plans align with the user's original request
3. Use question tool to clarify any remaining questions with the user

### Phase 4: Final Plan
Goal: Write your final plan to the plan file (the only file you can edit).
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified
- Include a verification section describing how to test the changes end-to-end (run the code, use MCP tools, run tests)

### Phase 5: Call plan_exit tool
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call plan_exit to indicate to the user that you are done planning.
This is critical - your turn should only end with either asking the user a question or calling plan_exit. Do not stop unless it's for these 2 reasons.

**Important:** Use question tool to clarify requirements/approach, use plan_exit to request plan approval. Do NOT use question tool to ask "Is this plan okay?" - that's what plan_exit does.

NOTE: At any point in time through this workflow you should feel free to ask the user questions or clarifications. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.
</system-reminder>`,
      synthetic: true,
    }) as MessageV2.Part
    userMessage.parts.push(part)
    return input.messages
  }
  return input.messages
}

export { state }
