/**
 * Response Mapper - OpenAI Responses API
 * Purpose: Response mapping and transformation
 */

import type {
  LanguageModelV2Content,
  LanguageModelV2CallWarning,
} from "@ai-sdk/provider"
import { generateId } from "@ai-sdk/provider-utils"
import { z } from "zod/v4"
import { LOGPROBS_SCHEMA } from "./response-parser"
import { codeInterpreterInputSchema, codeInterpreterOutputSchema } from "./tool/code-interpreter"
import { fileSearchOutputSchema } from "./tool/file-search"
import { imageGenerationOutputSchema } from "./tool/image-generation"
import { localShellInputSchema } from "./tool/local-shell"
import type { OpenAIConfig } from "./openai-config"

type ResponsesModelConfig = {
  isReasoningModel: boolean
  systemMessageMode: "remove" | "system" | "developer"
  requiredAutoTruncation: boolean
  supportsFlexProcessing: boolean
  supportsPriorityProcessing: boolean
}

export function getResponsesModelConfig(modelId: string): ResponsesModelConfig {
  const supportsFlexProcessing =
    modelId.startsWith("o3") ||
    modelId.startsWith("o4-mini") ||
    (modelId.startsWith("gpt-5") && !modelId.startsWith("gpt-5-chat"))
  const supportsPriorityProcessing =
    modelId.startsWith("gpt-4") ||
    modelId.startsWith("gpt-5-mini") ||
    (modelId.startsWith("gpt-5") && !modelId.startsWith("gpt-5-nano") && !modelId.startsWith("gpt-5-chat")) ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4-mini")
  const defaults = {
    requiredAutoTruncation: false,
    systemMessageMode: "system" as const,
    supportsFlexProcessing,
    supportsPriorityProcessing,
  }

  // gpt-5-chat models are non-reasoning
  if (modelId.startsWith("gpt-5-chat")) {
    return {
      ...defaults,
      isReasoningModel: false,
    }
  }

  // o series reasoning models:
  if (
    modelId.startsWith("o") ||
    modelId.startsWith("gpt-5") ||
    modelId.startsWith("codex-") ||
    modelId.startsWith("computer-use")
  ) {
    if (modelId.startsWith("o1-mini") || modelId.startsWith("o1-preview")) {
      return {
        ...defaults,
        isReasoningModel: true,
        systemMessageMode: "remove",
      }
    }

    return {
      ...defaults,
      isReasoningModel: true,
      systemMessageMode: "developer",
    }
  }

  // gpt models:
  return {
    ...defaults,
    isReasoningModel: false,
  }
}

/**
 * Maps response output to content array
 */
export function mapResponseToContent(params: {
  output: any[]
  webSearchToolName: string | undefined
  config: OpenAIConfig
  logprobs: Array<z.infer<typeof LOGPROBS_SCHEMA>>
  providerOptions?: { openai?: { logprobs?: boolean | number } }
}): {
  content: Array<LanguageModelV2Content>
  hasFunctionCall: boolean
} {
  const { output, webSearchToolName, config, logprobs, providerOptions } = params
  const content: Array<LanguageModelV2Content> = []
  let hasFunctionCall = false

  for (const part of output) {
    switch (part.type) {
      case "reasoning": {
        // when there are no summary parts, we need to add an empty reasoning part:
        if (part.summary.length === 0) {
          part.summary.push({ type: "summary_text", text: "" })
        }

        for (const summary of part.summary) {
          content.push({
            type: "reasoning" as const,
            text: summary.text,
            providerMetadata: {
              openai: {
                itemId: part.id,
                reasoningEncryptedContent: part.encrypted_content ?? null,
              },
            },
          })
        }
        break
      }

      case "image_generation_call": {
        content.push({
          type: "tool-call",
          toolCallId: part.id,
          toolName: "image_generation",
          input: "{}",
          providerExecuted: true,
        })

        content.push({
          type: "tool-result",
          toolCallId: part.id,
          toolName: "image_generation",
          result: {
            result: part.result,
          } satisfies z.infer<typeof imageGenerationOutputSchema>,
          providerExecuted: true,
        })

        break
      }

      case "local_shell_call": {
        content.push({
          type: "tool-call",
          toolCallId: part.call_id,
          toolName: "local_shell",
          input: JSON.stringify({ action: part.action } satisfies z.infer<typeof localShellInputSchema>),
          providerMetadata: {
            openai: {
              itemId: part.id,
            },
          },
        })

        break
      }

      case "message": {
        for (const contentPart of part.content) {
          if (providerOptions?.openai?.logprobs && contentPart.logprobs) {
            logprobs.push(contentPart.logprobs)
          }

          content.push({
            type: "text",
            text: contentPart.text,
            providerMetadata: {
              openai: {
                itemId: part.id,
              },
            },
          })

          for (const annotation of contentPart.annotations) {
            if (annotation.type === "url_citation") {
              content.push({
                type: "source",
                sourceType: "url",
                id: config.generateId?.() ?? generateId(),
                url: annotation.url,
                title: annotation.title,
              })
            } else if (annotation.type === "file_citation") {
              content.push({
                type: "source",
                sourceType: "document",
                id: config.generateId?.() ?? generateId(),
                mediaType: "text/plain",
                title: annotation.quote ?? annotation.filename ?? "Document",
                filename: annotation.filename ?? annotation.file_id,
              })
            }
          }
        }

        break
      }

      case "function_call": {
        hasFunctionCall = true

        content.push({
          type: "tool-call",
          toolCallId: part.call_id,
          toolName: part.name,
          input: part.arguments,
          providerMetadata: {
            openai: {
              itemId: part.id,
            },
          },
        })
        break
      }

      case "web_search_call": {
        content.push({
          type: "tool-call",
          toolCallId: part.id,
          toolName: webSearchToolName ?? "web_search",
          input: JSON.stringify({ action: part.action }),
          providerExecuted: true,
        })

        content.push({
          type: "tool-result",
          toolCallId: part.id,
          toolName: webSearchToolName ?? "web_search",
          result: { status: part.status },
          providerExecuted: true,
        })

        break
      }

      case "computer_call": {
        content.push({
          type: "tool-call",
          toolCallId: part.id,
          toolName: "computer_use",
          input: "",
          providerExecuted: true,
        })

        content.push({
          type: "tool-result",
          toolCallId: part.id,
          toolName: "computer_use",
          result: {
            type: "computer_use_tool_result",
            status: part.status || "completed",
          },
          providerExecuted: true,
        })
        break
      }

      case "file_search_call": {
        content.push({
          type: "tool-call",
          toolCallId: part.id,
          toolName: "file_search",
          input: "{}",
          providerExecuted: true,
        })

        content.push({
          type: "tool-result",
          toolCallId: part.id,
          toolName: "file_search",
          result: {
            queries: part.queries,
            results:
              part.results?.map((result: any) => ({
                attributes: result.attributes,
                fileId: result.file_id,
                filename: result.filename,
                score: result.score,
                text: result.text,
              })) ?? null,
          } satisfies z.infer<typeof fileSearchOutputSchema>,
          providerExecuted: true,
        })
        break
      }

      case "code_interpreter_call": {
        content.push({
          type: "tool-call",
          toolCallId: part.id,
          toolName: "code_interpreter",
          input: JSON.stringify({
            code: part.code,
            containerId: part.container_id,
          } satisfies z.infer<typeof codeInterpreterInputSchema>),
          providerExecuted: true,
        })

        content.push({
          type: "tool-result",
          toolCallId: part.id,
          toolName: "code_interpreter",
          result: {
            outputs: part.outputs,
          } satisfies z.infer<typeof codeInterpreterOutputSchema>,
          providerExecuted: true,
        })
        break
      }
    }
  }

  return { content, hasFunctionCall }
}

/**
 * Validates reasoning model warnings
 */
export function validateReasoningModelWarnings(
  baseArgs: any,
  modelConfig: ResponsesModelConfig,
  openaiOptions: any,
): LanguageModelV2CallWarning[] {
  const warnings: LanguageModelV2CallWarning[] = []

  if (modelConfig.isReasoningModel) {
    // remove unsupported settings for reasoning models
    // see https:/platform.openai.com/docs/guides/reasoning#limitations
    if (baseArgs.temperature != null) {
      baseArgs.temperature = undefined
      warnings.push({
        type: "unsupported-setting",
        setting: "temperature",
        details: "temperature is not supported for reasoning models",
      })
    }

    if (baseArgs.top_p != null) {
      baseArgs.top_p = undefined
      warnings.push({
        type: "unsupported-setting",
        setting: "topP",
        details: "topP is not supported for reasoning models",
      })
    }
  } else {
    if (openaiOptions?.reasoningEffort != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "reasoningEffort",
        details: "reasoningEffort is not supported for non-reasoning models",
      })
    }

    if (openaiOptions?.reasoningSummary != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "reasoningSummary",
        details: "reasoningSummary is not supported for non-reasoning models",
      })
    }
  }

  return warnings
}

/**
 * Validates service tier support
 */
export function validateServiceTierWarnings(
  baseArgs: any,
  modelConfig: ResponsesModelConfig,
  openaiOptions: any,
): LanguageModelV2CallWarning[] {
  const warnings: LanguageModelV2CallWarning[] = []

  // Validate flex processing support
  if (openaiOptions?.serviceTier === "flex" && !modelConfig.supportsFlexProcessing) {
    warnings.push({
      type: "unsupported-setting",
      setting: "serviceTier",
      details: "flex processing is only available for o3, o4-mini, and gpt-5 models",
    })
    // Remove from args if not supported
    delete (baseArgs as any).service_tier
  }

  // Validate priority processing support
  if (openaiOptions?.serviceTier === "priority" && !modelConfig.supportsPriorityProcessing) {
    warnings.push({
      type: "unsupported-setting",
      setting: "serviceTier",
      details:
        "priority processing is only available for supported models (gpt-4, gpt-5, gpt-5-mini, o3, o4-mini) and requires Enterprise access. gpt-5-nano is not supported",
    })
    // Remove from args if not supported
    delete (baseArgs as any).service_tier
  }

  return warnings
}
