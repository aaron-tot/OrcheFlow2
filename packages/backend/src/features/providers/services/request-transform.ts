/**
 * Request Transformation Logic
 * Purpose: Transforms and normalizes API request messages and parameters
 */
import type { ModelMessage } from "ai"
import { unique } from "remeda"
import type { Provider } from "./provider"
import type { ModelsDev } from "./models"

type Modality = NonNullable<ModelsDev.Model["modalities"]>["input"][number]

function mimeToModality(mime: string): Modality | undefined {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("video/")) return "video"
  if (mime === "application/pdf") return "pdf"
  return undefined
}

// Maps npm package to the key the AI SDK expects for providerOptions
function sdkKey(npm: string): string | undefined {
  switch (npm) {
    case "@ai-sdk/github-copilot":
    case "@ai-sdk/openai":
    case "@ai-sdk/azure":
      return "openai"
    case "@ai-sdk/amazon-bedrock":
      return "bedrock"
    case "@ai-sdk/anthropic":
      return "anthropic"
    case "@ai-sdk/google-vertex":
    case "@ai-sdk/google":
      return "google"
    case "@ai-sdk/gateway":
      return "gateway"
    case "@openrouter/ai-sdk-provider":
      return "openrouter"
  }
  return undefined
}

function normalizeMessages(
  msgs: ModelMessage[],
  model: Provider.Model,
  options: Record<string, unknown>,
): ModelMessage[] {
  // Anthropic rejects messages with empty content - filter out empty string messages
  // and remove empty text/reasoning parts from array content
  if (model.api.npm === "@ai-sdk/anthropic") {
    msgs = msgs
      .map((msg) => {
        if (typeof msg.content === "string") {
          if (msg.content === "") return undefined
          return msg
        }
        if (!Array.isArray(msg.content)) return msg
        const filtered = msg.content.filter((part) => {
          if (part.type === "text" || part.type === "reasoning") {
            return part.text !== ""
          }
          return true
        })
        if (filtered.length === 0) return undefined
        return { ...msg, content: filtered }
      })
      .filter((msg): msg is ModelMessage => msg !== undefined && msg.content !== "")
  }

  if (model.api.id.includes("claude")) {
    return msgs.map((msg) => {
      if ((msg.role === "assistant" || msg.role === "tool") && Array.isArray(msg.content)) {
        msg.content = msg.content.map((part) => {
          if ((part.type === "tool-call" || part.type === "tool-result") && "toolCallId" in part) {
            return {
              ...part,
              toolCallId: part.toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_"),
            }
          }
          return part
        })
      }
      return msg
    })
  }
  if (model.providerID === "mistral" || model.api.id.toLowerCase().includes("mistral")) {
    const result: ModelMessage[] = []
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      const nextMsg = msgs[i + 1]

      if ((msg.role === "assistant" || msg.role === "tool") && Array.isArray(msg.content)) {
        msg.content = msg.content.map((part) => {
          if ((part.type === "tool-call" || part.type === "tool-result") && "toolCallId" in part) {
            // Mistral requires alphanumeric tool call IDs with exactly 9 characters
            const normalizedId = part.toolCallId
              .replace(/[^a-zA-Z0-9]/g, "") // Remove non-alphanumeric characters
              .substring(0, 9) // Take first 9 characters
              .padEnd(9, "0") // Pad with zeros if less than 9 characters

            return {
              ...part,
              toolCallId: normalizedId,
            }
          }
          return part
        })
      }

      result.push(msg)

      // Fix message sequence: tool messages cannot be followed by user messages
      if (msg.role === "tool" && nextMsg?.role === "user") {
        result.push({
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Done.",
            },
          ],
        })
      }
    }
    return result
  }

  if (typeof model.capabilities.interleaved === "object" && model.capabilities.interleaved.field) {
    const field = model.capabilities.interleaved.field
    return msgs.map((msg) => {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const reasoningParts = msg.content.filter((part: any) => part.type === "reasoning")
        const reasoningText = reasoningParts.map((part: any) => part.text).join("")

        // Filter out reasoning parts from content
        const filteredContent = msg.content.filter((part: any) => part.type !== "reasoning")

        // Include reasoning_content | reasoning_details directly on the message for all assistant messages
        if (reasoningText) {
          return {
            ...msg,
            content: filteredContent,
            providerOptions: {
              ...msg.providerOptions,
              openaiCompatible: {
                ...(msg.providerOptions as any)?.openaiCompatible,
                [field]: reasoningText,
              },
            },
          }
        }

        return {
          ...msg,
          content: filteredContent,
        }
      }

      return msg
    })
  }

  return msgs
}

function applyCaching(msgs: ModelMessage[], providerID: string): ModelMessage[] {
  const system = msgs.filter((msg) => msg.role === "system").slice(0, 2)
  const final = msgs.filter((msg) => msg.role !== "system").slice(-2)

  const providerOptions = {
    anthropic: {
      cacheControl: { type: "ephemeral" },
    },
    openrouter: {
      cacheControl: { type: "ephemeral" },
    },
    bedrock: {
      cachePoint: { type: "ephemeral" },
    },
    openaiCompatible: {
      cache_control: { type: "ephemeral" },
    },
  }

  for (const msg of unique([...system, ...final])) {
    const shouldUseContentOptions = providerID !== "anthropic" && Array.isArray(msg.content) && msg.content.length > 0

    if (shouldUseContentOptions) {
      const lastContent = msg.content[msg.content.length - 1]
      if (lastContent && typeof lastContent === "object") {
        lastContent.providerOptions = {
          ...lastContent.providerOptions,
          ...providerOptions,
        }
        continue
      }
    }

    msg.providerOptions = {
      ...msg.providerOptions,
      ...providerOptions,
    }
  }

  return msgs
}

function unsupportedParts(msgs: ModelMessage[], model: Provider.Model): ModelMessage[] {
  return msgs.map((msg) => {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return msg

    const filtered = msg.content.map((part) => {
      if (part.type !== "file" && part.type !== "image") return part

      // Check for empty base64 image data
      if (part.type === "image") {
        const imageStr = part.image.toString()
        if (imageStr.startsWith("data:")) {
          const match = imageStr.match(/^data:([^;]+);base64,(.*)$/)
          if (match && (!match[2] || match[2].length === 0)) {
            return {
              type: "text" as const,
              text: "ERROR: Image file is empty or corrupted. Please provide a valid image.",
            }
          }
        }
      }

      const mime = part.type === "image" ? part.image.toString().split(";")[0].replace("data:", "") : part.mediaType
      const filename = part.type === "file" ? part.filename : undefined
      const modality = mimeToModality(mime)
      if (!modality) return part
      if (model.capabilities.input[modality]) return part

      const name = filename ? `"${filename}"` : modality
      return {
        type: "text" as const,
        text: `ERROR: Cannot read ${name} (this model does not support ${modality} input). Inform the user.`,
      }
    })

    return { ...msg, content: filtered }
  })
}

export function transformMessages(msgs: ModelMessage[], model: Provider.Model, options: Record<string, unknown>) {
  msgs = unsupportedParts(msgs, model)
  msgs = normalizeMessages(msgs, model, options)
  if (
    model.providerID === "anthropic" ||
    model.api.id.includes("anthropic") ||
    model.api.id.includes("claude") ||
    model.api.npm === "@ai-sdk/anthropic"
  ) {
    msgs = applyCaching(msgs, model.providerID)
  }

  // Remap providerOptions keys from stored providerID to expected SDK key
  const key = sdkKey(model.api.npm)
  if (key && key !== model.providerID && model.api.npm !== "@ai-sdk/azure") {
    const remap = (opts: Record<string, any> | undefined) => {
      if (!opts) return opts
      if (!(model.providerID in opts)) return opts
      const result = { ...opts }
      result[key] = result[model.providerID]
      delete result[model.providerID]
      return result
    }

    msgs = msgs.map((msg) => {
      if (!Array.isArray(msg.content)) return { ...msg, providerOptions: remap(msg.providerOptions) }
      return {
        ...msg,
        providerOptions: remap(msg.providerOptions),
        content: msg.content.map((part) => ({ ...part, providerOptions: remap(part.providerOptions) })),
      } as typeof msg
    })
  }

  return msgs
}

export function transformTemperature(model: Provider.Model) {
  const id = model.id.toLowerCase()
  if (id.includes("qwen")) return 0.55
  if (id.includes("claude")) return undefined
  if (id.includes("gemini")) return 1.0
  if (id.includes("glm-4.6")) return 1.0
  if (id.includes("glm-4.7")) return 1.0
  if (id.includes("minimax-m2")) return 1.0
  if (id.includes("kimi-k2")) {
    if (id.includes("thinking")) return 1.0
    return 0.6
  }
  return undefined
}

export function transformTopP(model: Provider.Model) {
  const id = model.id.toLowerCase()
  if (id.includes("qwen")) return 1
  if (id.includes("minimax-m2")) {
    return 0.95
  }
  if (id.includes("gemini")) return 0.95
  return undefined
}

export function transformTopK(model: Provider.Model) {
  const id = model.id.toLowerCase()
  if (id.includes("minimax-m2")) {
    if (id.includes("m2.1")) return 40
    return 20
  }
  if (id.includes("gemini")) return 64
  return undefined
}

export function transformProviderOptions(model: Provider.Model, options: { [x: string]: any }) {
  const key = sdkKey(model.api.npm) ?? model.providerID
  return { [key]: options }
}

export function transformMaxOutputTokens(
  npm: string,
  options: Record<string, any>,
  modelLimit: number,
  globalLimit: number,
): number {
  const modelCap = modelLimit || globalLimit
  const standardLimit = Math.min(modelCap, globalLimit)

  if (npm === "@ai-sdk/anthropic") {
    const thinking = options?.["thinking"]
    const budgetTokens = typeof thinking?.["budgetTokens"] === "number" ? thinking["budgetTokens"] : 0
    const enabled = thinking?.["type"] === "enabled"
    if (enabled && budgetTokens > 0) {
      // Return text tokens so that text + thinking <= model cap, preferring 32k text when possible.
      if (budgetTokens + standardLimit <= modelCap) {
        return standardLimit
      }
      return modelCap - budgetTokens
    }
  }

  return standardLimit
}
