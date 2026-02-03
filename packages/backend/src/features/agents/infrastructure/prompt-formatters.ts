/**
 * Prompt Formatters: Message formatting, model conversion, and title generation
 * Purpose: Convert messages to model format and handle metadata formatting
 */

import { MessageV2 } from "./message-v2"
import { Log } from "../../../shared/utils/log"
import { Session } from "."
import { Agent } from "../services/AgentExecutor"
import { Provider } from "../../providers/services/provider"
import { LLM } from "./llm"
import { iife } from "../../../shared/utils/iife"
import { Identifier } from "../../../shared/utils/id/id"

const log = Log.create({ service: "session.prompt" })

export async function ensureTitle(input: {
  session: Session.Info
  history: MessageV2.WithParts[]
  providerID: string
  modelID: string
}) {
  if (input.session.parentID) return
  if (!Session.isDefaultTitle(input.session.title)) return

  // Find first non-synthetic user message
  const firstRealUserIdx = input.history.findIndex(
    (m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic),
  )
  if (firstRealUserIdx === -1) return

  const isFirst =
    input.history.filter((m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic))
      .length === 1
  if (!isFirst) return

  // Gather all messages up to and including the first real user message for context
  // This includes any shell/subtask executions that preceded the user's first prompt
  const contextMessages = input.history.slice(0, firstRealUserIdx + 1)
  const firstRealUser = contextMessages[firstRealUserIdx]
  if (!firstRealUser) return

  // For subtask-only messages (from command invocations), extract the prompt directly
  // since toModelMessage converts subtask parts to generic "The following tool was executed by the user"
  const subtaskParts = firstRealUser.parts.filter((p) => p.type === "subtask") as MessageV2.SubtaskPart[]
  const hasOnlySubtaskParts = subtaskParts.length > 0 && firstRealUser.parts.every((p) => p.type === "subtask")

  const agent = await Agent.get("title")
  if (!agent) return
  const model = await iife(async () => {
    if (agent.model) return await Provider.getModel(agent.model.providerID, agent.model.modelID)
    return (
      (await Provider.getSmallModel(input.providerID)) ?? (await Provider.getModel(input.providerID, input.modelID))
    )
  })
  const result = await LLM.stream({
    agent,
    user: firstRealUser.info as MessageV2.User,
    system: [],
    small: true,
    tools: {},
    model,
    abort: new AbortController().signal,
    sessionID: input.session.id,
    retries: 2,
    messages: [
      {
        role: "user",
        content: "Generate a title for this conversation:\n",
      },
      ...(hasOnlySubtaskParts
        ? [{ role: "user" as const, content: subtaskParts.map((p) => p.prompt).join("\n") }]
        : MessageV2.toModelMessages(contextMessages, model)),
    ],
  })
  const text = await result.text.catch((err) => log.error("failed to generate title", { error: err }))
  if (text)
    return Session.update(
      input.session.id,
      (draft) => {
        const cleaned = text
          .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0)
        if (!cleaned) return

        const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
        draft.title = title
      },
      { touch: false },
    )
}
