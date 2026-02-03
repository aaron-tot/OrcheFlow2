/**
 * OpenAI Responses Language Model - Main Implementation
 * Purpose: Main class coordinating response generation and streaming
 */

import {
  type LanguageModelV2,
  type LanguageModelV2CallWarning,
  type LanguageModelV2Content,
  type LanguageModelV2FinishReason,
  type LanguageModelV2ProviderDefinedTool,
  type LanguageModelV2StreamPart,
  type LanguageModelV2Usage,
  type SharedV2ProviderMetadata,
} from "@ai-sdk/provider"
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  type ParseResult,
  postJsonToApi,
} from "@ai-sdk/provider-utils"
import { z } from "zod/v4"
import type { OpenAIConfig } from "./openai-config"
import { handleResponseError } from "./error-handler"
import { convertToOpenAIResponsesInput } from "./convert-to-openai-responses-input"
import { mapOpenAIResponseFinishReason } from "./map-openai-responses-finish-reason"
import type { OpenAIResponsesIncludeOptions, OpenAIResponsesIncludeValue } from "./openai-responses-api-types"
import { prepareResponsesTools } from "./openai-responses-prepare-tools"
import type { OpenAIResponsesModelId } from "./openai-responses-settings"
import {
  LOGPROBS_SCHEMA,
  TOP_LOGPROBS_MAX,
  usageSchema,
  openaiResponsesChunkSchema,
  openaiResponsesProviderOptionsSchema,
  webSearchCallItem,
  fileSearchCallItem,
  codeInterpreterCallItem,
  imageGenerationCallItem,
  localShellCallItem,
} from "./response-parser"
import {
  isTextDeltaChunk,
  isResponseOutputItemDoneChunk,
  isResponseOutputItemDoneReasoningChunk,
  isResponseFinishedChunk,
  isResponseCreatedChunk,
  isResponseFunctionCallArgumentsDeltaChunk,
  isResponseImageGenerationCallPartialImageChunk,
  isResponseCodeInterpreterCallCodeDeltaChunk,
  isResponseCodeInterpreterCallCodeDoneChunk,
  isResponseOutputItemAddedChunk,
  isResponseOutputItemAddedReasoningChunk,
  isResponseAnnotationAddedChunk,
  isResponseReasoningSummaryPartAddedChunk,
  isResponseReasoningSummaryTextDeltaChunk,
  isErrorChunk,
  codeInterpreterInputSchema,
  fileSearchOutputSchema,
  imageGenerationOutputSchema,
  localShellInputSchema,
} from "./stream-handler"
import {
  getResponsesModelConfig,
  mapResponseToContent,
  validateReasoningModelWarnings,
  validateServiceTierWarnings,
} from "./response-mapper"

export class OpenAIResponsesLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2"

  readonly modelId: OpenAIResponsesModelId

  private readonly config: OpenAIConfig

  constructor(modelId: OpenAIResponsesModelId, config: OpenAIConfig) {
    this.modelId = modelId
    this.config = config
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    "image/*": [/^https?:\/\/.*$/],
    "application/pdf": [/^https?:\/\/.*$/],
  }

  get provider(): string {
    return this.config.provider
  }

  private async getArgs({
    maxOutputTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat,
  }: Parameters<LanguageModelV2["doGenerate"]>[0]) {
    const warnings: LanguageModelV2CallWarning[] = []
    const modelConfig = getResponsesModelConfig(this.modelId)

    if (topK != null) {
      warnings.push({ type: "unsupported-setting", setting: "topK" })
    }

    if (seed != null) {
      warnings.push({ type: "unsupported-setting", setting: "seed" })
    }

    if (presencePenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "presencePenalty",
      })
    }

    if (frequencyPenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "frequencyPenalty",
      })
    }

    if (stopSequences != null) {
      warnings.push({ type: "unsupported-setting", setting: "stopSequences" })
    }

    const openaiOptions = await parseProviderOptions({
      provider: "openai",
      providerOptions,
      schema: openaiResponsesProviderOptionsSchema,
    })

    const { input, warnings: inputWarnings } = await convertToOpenAIResponsesInput({
      prompt,
      systemMessageMode: modelConfig.systemMessageMode,
      fileIdPrefixes: this.config.fileIdPrefixes,
      store: openaiOptions?.store ?? true,
      hasLocalShellTool: hasOpenAITool("openai.local_shell"),
    })

    warnings.push(...inputWarnings)

    const strictJsonSchema = openaiOptions?.strictJsonSchema ?? false

    let include: OpenAIResponsesIncludeOptions = openaiOptions?.include

    function addInclude(key: OpenAIResponsesIncludeValue) {
      include = include != null ? [...include, key] : [key]
    }

    function hasOpenAITool(id: string) {
      return tools?.find((tool) => tool.type === "provider-defined" && tool.id === id) != null
    }

    // when logprobs are requested, automatically include them:
    const topLogprobs =
      typeof openaiOptions?.logprobs === "number"
        ? openaiOptions?.logprobs
        : openaiOptions?.logprobs === true
          ? TOP_LOGPROBS_MAX
          : undefined

    if (topLogprobs) {
      addInclude("message.output_text.logprobs")
    }

    // when a web search tool is present, automatically include the sources:
    const webSearchToolName = (
      tools?.find(
        (tool) =>
          tool.type === "provider-defined" &&
          (tool.id === "openai.web_search" || tool.id === "openai.web_search_preview"),
      ) as LanguageModelV2ProviderDefinedTool | undefined
    )?.name

    if (webSearchToolName) {
      addInclude("web_search_call.action.sources")
    }

    // when a code interpreter tool is present, automatically include the outputs:
    if (hasOpenAITool("openai.code_interpreter")) {
      addInclude("code_interpreter_call.outputs")
    }

    const baseArgs = {
      model: this.modelId,
      input,
      temperature,
      top_p: topP,
      max_output_tokens: maxOutputTokens,

      ...((responseFormat?.type === "json" || openaiOptions?.textVerbosity) && {
        text: {
          ...(responseFormat?.type === "json" && {
            format:
              responseFormat.schema != null
                ? {
                    type: "json_schema",
                    strict: strictJsonSchema,
                    name: responseFormat.name ?? "response",
                    description: responseFormat.description,
                    schema: responseFormat.schema,
                  }
                : { type: "json_object" },
          }),
          ...(openaiOptions?.textVerbosity && {
            verbosity: openaiOptions.textVerbosity,
          }),
        },
      }),

      // provider options:
      max_tool_calls: openaiOptions?.maxToolCalls,
      metadata: openaiOptions?.metadata,
      parallel_tool_calls: openaiOptions?.parallelToolCalls,
      previous_response_id: openaiOptions?.previousResponseId,
      store: openaiOptions?.store,
      user: openaiOptions?.user,
      instructions: openaiOptions?.instructions,
      service_tier: openaiOptions?.serviceTier,
      include,
      prompt_cache_key: openaiOptions?.promptCacheKey,
      safety_identifier: openaiOptions?.safetyIdentifier,
      top_logprobs: topLogprobs,

      // model-specific settings:
      ...(modelConfig.isReasoningModel &&
        (openaiOptions?.reasoningEffort != null || openaiOptions?.reasoningSummary != null) && {
          reasoning: {
            ...(openaiOptions?.reasoningEffort != null && {
              effort: openaiOptions.reasoningEffort,
            }),
            ...(openaiOptions?.reasoningSummary != null && {
              summary: openaiOptions.reasoningSummary,
            }),
          },
        }),
      ...(modelConfig.requiredAutoTruncation && {
        truncation: "auto",
      }),
    }

    warnings.push(...validateReasoningModelWarnings(baseArgs, modelConfig, openaiOptions))
    warnings.push(...validateServiceTierWarnings(baseArgs, modelConfig, openaiOptions))

    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareResponsesTools({
      tools,
      toolChoice,
      strictJsonSchema,
    })

    return {
      webSearchToolName,
      args: {
        ...baseArgs,
        tools: openaiTools,
        tool_choice: openaiToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV2["doGenerate"]>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2["doGenerate"]>>> {
    const { args: body, warnings, webSearchToolName } = await this.getArgs(options)
    const url = this.config.url({
      path: "/responses",
      modelId: this.modelId,
    })

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: handleResponseError as any,
      successfulResponseHandler: createJsonResponseHandler(
        z.object({
          id: z.string(),
          created_at: z.number(),
          error: z
            .object({
              code: z.string(),
              message: z.string(),
            })
            .nullish(),
          model: z.string(),
          output: z.array(
            z.discriminatedUnion("type", [
              z.object({
                type: z.literal("message"),
                role: z.literal("assistant"),
                id: z.string(),
                content: z.array(
                  z.object({
                    type: z.literal("output_text"),
                    text: z.string(),
                    logprobs: LOGPROBS_SCHEMA.nullish(),
                    annotations: z.array(
                      z.discriminatedUnion("type", [
                        z.object({
                          type: z.literal("url_citation"),
                          start_index: z.number(),
                          end_index: z.number(),
                          url: z.string(),
                          title: z.string(),
                        }),
                        z.object({
                          type: z.literal("file_citation"),
                          file_id: z.string(),
                          filename: z.string().nullish(),
                          index: z.number().nullish(),
                          start_index: z.number().nullish(),
                          end_index: z.number().nullish(),
                          quote: z.string().nullish(),
                        }),
                        z.object({
                          type: z.literal("container_file_citation"),
                        }),
                      ]),
                    ),
                  }),
                ),
              }),
              webSearchCallItem,
              fileSearchCallItem,
              codeInterpreterCallItem,
              imageGenerationCallItem,
              localShellCallItem,
              z.object({
                type: z.literal("function_call"),
                call_id: z.string(),
                name: z.string(),
                arguments: z.string(),
                id: z.string(),
              }),
              z.object({
                type: z.literal("computer_call"),
                id: z.string(),
                status: z.string().optional(),
              }),
              z.object({
                type: z.literal("reasoning"),
                id: z.string(),
                encrypted_content: z.string().nullish(),
                summary: z.array(
                  z.object({
                    type: z.literal("summary_text"),
                    text: z.string(),
                  }),
                ),
              }),
            ]),
          ),
          service_tier: z.string().nullish(),
          incomplete_details: z.object({ reason: z.string() }).nullish(),
          usage: usageSchema,
        }),
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    if (response.error) {
      handleResponseError({
        response,
        url,
        body,
        responseHeaders,
        rawResponse: rawResponse as string,
      })
    }

    const logprobs: Array<z.infer<typeof LOGPROBS_SCHEMA>> = []

    const { content, hasFunctionCall } = mapResponseToContent({
      output: response.output,
      webSearchToolName,
      config: this.config,
      logprobs,
      providerOptions: options.providerOptions,
    })

    const providerMetadata: SharedV2ProviderMetadata = {
      openai: { responseId: response.id },
    }

    if (logprobs.length > 0) {
      providerMetadata.openai.logprobs = logprobs
    }

    if (typeof response.service_tier === "string") {
      providerMetadata.openai.serviceTier = response.service_tier
    }

    return {
      content,
      finishReason: mapOpenAIResponseFinishReason({
        finishReason: response.incomplete_details?.reason,
        hasFunctionCall,
      }),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens ?? undefined,
        cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? undefined,
      },
      request: { body },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1000),
        modelId: response.model,
        headers: responseHeaders,
        body: rawResponse,
      },
      providerMetadata,
      warnings,
    }
  }

  async doStream(
    options: Parameters<LanguageModelV2["doStream"]>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
    const { args: body, warnings, webSearchToolName } = await this.getArgs(options)

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/responses",
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        stream: true,
      },
      failedResponseHandler: handleResponseError as any,
      successfulResponseHandler: createEventSourceResponseHandler(openaiResponsesChunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const self = this

    let finishReason: LanguageModelV2FinishReason = "unknown"
    const usage: LanguageModelV2Usage = {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    }
    const logprobs: Array<z.infer<typeof LOGPROBS_SCHEMA>> = []
    let responseId: string | null = null
    const ongoingToolCalls: Record<
      number,
      | {
          toolName: string
          toolCallId: string
          codeInterpreter?: {
            containerId: string
          }
        }
      | undefined
    > = {}

    // flag that checks if there have been client-side tool calls (not executed by openai)
    let hasFunctionCall = false

    // Track reasoning by output_index instead of item_id
    // GitHub Copilot rotates encrypted item IDs on every event
    const activeReasoning: Record<
      number,
      {
        canonicalId: string // the item.id from output_item.added
        encryptedContent?: string | null
        summaryParts: number[]
      }
    > = {}

    // Track current active reasoning output_index for correlating summary events
    let currentReasoningOutputIndex: number | null = null

    // Track a stable text part id for the current assistant message.
    // Copilot may change item_id across text deltas; normalize to one id.
    let currentTextId: string | null = null

    let serviceTier: string | undefined

    return {
      stream: response.pipeThrough(
        new TransformStream<ParseResult<z.infer<typeof openaiResponsesChunkSchema>>, LanguageModelV2StreamPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings })
          },

          transform(chunk, controller) {
            if (options.includeRawChunks) {
              controller.enqueue({ type: "raw", rawValue: chunk.rawValue })
            }

            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = "error"
              controller.enqueue({ type: "error", error: chunk.error })
              return
            }

            const value = chunk.value

            if (isResponseOutputItemAddedChunk(value)) {
              if (value.item.type === "function_call") {
                ongoingToolCalls[value.output_index] = {
                  toolName: value.item.name,
                  toolCallId: value.item.call_id,
                }

                controller.enqueue({
                  type: "tool-input-start",
                  id: value.item.call_id,
                  toolName: value.item.name,
                })
              } else if (value.item.type === "web_search_call") {
                ongoingToolCalls[value.output_index] = {
                  toolName: webSearchToolName ?? "web_search",
                  toolCallId: value.item.id,
                }

                controller.enqueue({
                  type: "tool-input-start",
                  id: value.item.id,
                  toolName: webSearchToolName ?? "web_search",
                })
              } else if (value.item.type === "computer_call") {
                ongoingToolCalls[value.output_index] = {
                  toolName: "computer_use",
                  toolCallId: value.item.id,
                }

                controller.enqueue({
                  type: "tool-input-start",
                  id: value.item.id,
                  toolName: "computer_use",
                })
              } else if (value.item.type === "code_interpreter_call") {
                ongoingToolCalls[value.output_index] = {
                  toolName: "code_interpreter",
                  toolCallId: value.item.id,
                  codeInterpreter: {
                    containerId: value.item.container_id,
                  },
                }

                controller.enqueue({
                  type: "tool-input-start",
                  id: value.item.id,
                  toolName: "code_interpreter",
                })

                controller.enqueue({
                  type: "tool-input-delta",
                  id: value.item.id,
                  delta: `{"containerId":"${value.item.container_id}","code":"`,
                })
              } else if (value.item.type === "file_search_call") {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: value.item.id,
                  toolName: "file_search",
                  input: "{}",
                  providerExecuted: true,
                })
              } else if (value.item.type === "image_generation_call") {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: value.item.id,
                  toolName: "image_generation",
                  input: "{}",
                  providerExecuted: true,
                })
              } else if (value.item.type === "message") {
                // Start a stable text part for this assistant message
                currentTextId = value.item.id
                controller.enqueue({
                  type: "text-start",
                  id: value.item.id,
                  providerMetadata: {
                    openai: {
                      itemId: value.item.id,
                    },
                  },
                })
              } else if (isResponseOutputItemAddedReasoningChunk(value)) {
                activeReasoning[value.output_index] = {
                  canonicalId: value.item.id,
                  encryptedContent: value.item.encrypted_content,
                  summaryParts: [0],
                }
                currentReasoningOutputIndex = value.output_index

                controller.enqueue({
                  type: "reasoning-start",
                  id: `${value.item.id}:0`,
                  providerMetadata: {
                    openai: {
                      itemId: value.item.id,
                      reasoningEncryptedContent: value.item.encrypted_content ?? null,
                    },
                  },
                })
              }
            } else if (isResponseOutputItemDoneChunk(value)) {
              if (value.item.type === "function_call") {
                ongoingToolCalls[value.output_index] = undefined
                hasFunctionCall = true

                controller.enqueue({
                  type: "tool-input-end",
                  id: value.item.call_id,
                })

                controller.enqueue({
                  type: "tool-call",
                  toolCallId: value.item.call_id,
                  toolName: value.item.name,
                  input: value.item.arguments,
                  providerMetadata: {
                    openai: {
                      itemId: value.item.id,
                    },
                  },
                })
              } else if (value.item.type === "web_search_call") {
                ongoingToolCalls[value.output_index] = undefined

                controller.enqueue({
                  type: "tool-input-end",
                  id: value.item.id,
                })

                controller.enqueue({
                  type: "tool-call",
                  toolCallId: value.item.id,
                  toolName: "web_search",
                  input: JSON.stringify({ action: value.item.action }),
                  providerExecuted: true,
                })

                controller.enqueue({
                  type: "tool-result",
                  toolCallId: value.item.id,
                  toolName: "web_search",
                  result: { status: value.item.status },
                  providerExecuted: true,
                })
              } else if (value.item.type === "computer_call") {
                ongoingToolCalls[value.output_index] = undefined

                controller.enqueue({
                  type: "tool-input-end",
                  id: value.item.id,
                })

                controller.enqueue({
                  type: "tool-call",
                  toolCallId: value.item.id,
                  toolName: "computer_use",
                  input: "",
                  providerExecuted: true,
                })

                controller.enqueue({
                  type: "tool-result",
                  toolCallId: value.item.id,
                  toolName: "computer_use",
                  result: {
                    type: "computer_use_tool_result",
                    status: value.item.status || "completed",
                  },
                  providerExecuted: true,
                })
              } else if (value.item.type === "file_search_call") {
                ongoingToolCalls[value.output_index] = undefined

                controller.enqueue({
                  type: "tool-result",
                  toolCallId: value.item.id,
                  toolName: "file_search",
                  result: {
                    queries: value.item.queries,
                    results:
                      value.item.results?.map((result) => ({
                        attributes: result.attributes,
                        fileId: result.file_id,
                        filename: result.filename,
                        score: result.score,
                        text: result.text,
                      })) ?? null,
                  } satisfies z.infer<typeof fileSearchOutputSchema>,
                  providerExecuted: true,
                })
              } else if (value.item.type === "code_interpreter_call") {
                ongoingToolCalls[value.output_index] = undefined

                controller.enqueue({
                  type: "tool-result",
                  toolCallId: value.item.id,
                  toolName: "code_interpreter",
                  result: {
                    outputs: value.item.outputs,
                  } satisfies z.infer<typeof codeInterpreterInputSchema>,
                  providerExecuted: true,
                })
              } else if (value.item.type === "image_generation_call") {
                controller.enqueue({
                  type: "tool-result",
                  toolCallId: value.item.id,
                  toolName: "image_generation",
                  result: {
                    result: value.item.result,
                  } satisfies z.infer<typeof imageGenerationOutputSchema>,
                  providerExecuted: true,
                })
              } else if (value.item.type === "local_shell_call") {
                ongoingToolCalls[value.output_index] = undefined

                controller.enqueue({
                  type: "tool-call",
                  toolCallId: value.item.call_id,
                  toolName: "local_shell",
                  input: JSON.stringify({
                    action: {
                      type: "exec",
                      command: value.item.action.command,
                      timeoutMs: value.item.action.timeout_ms,
                      user: value.item.action.user,
                      workingDirectory: value.item.action.working_directory,
                      env: value.item.action.env,
                    },
                  } satisfies z.infer<typeof localShellInputSchema>),
                  providerMetadata: {
                    openai: { itemId: value.item.id },
                  },
                })
              } else if (value.item.type === "message") {
                if (currentTextId) {
                  controller.enqueue({
                    type: "text-end",
                    id: currentTextId,
                  })
                  currentTextId = null
                }
              } else if (isResponseOutputItemDoneReasoningChunk(value)) {
                const activeReasoningPart = activeReasoning[value.output_index]
                if (activeReasoningPart) {
                  for (const summaryIndex of activeReasoningPart.summaryParts) {
                    controller.enqueue({
                      type: "reasoning-end",
                      id: `${activeReasoningPart.canonicalId}:${summaryIndex}`,
                      providerMetadata: {
                        openai: {
                          itemId: activeReasoningPart.canonicalId,
                          reasoningEncryptedContent: value.item.encrypted_content ?? null,
                        },
                      },
                    })
                  }
                  delete activeReasoning[value.output_index]
                  if (currentReasoningOutputIndex === value.output_index) {
                    currentReasoningOutputIndex = null
                  }
                }
              }
            } else if (isResponseFunctionCallArgumentsDeltaChunk(value)) {
              const toolCall = ongoingToolCalls[value.output_index]

              if (toolCall != null) {
                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCall.toolCallId,
                  delta: value.delta,
                })
              }
            } else if (isResponseImageGenerationCallPartialImageChunk(value)) {
              controller.enqueue({
                type: "tool-result",
                toolCallId: value.item_id,
                toolName: "image_generation",
                result: {
                  result: value.partial_image_b64,
                } satisfies z.infer<typeof imageGenerationOutputSchema>,
                providerExecuted: true,
              })
            } else if (isResponseCodeInterpreterCallCodeDeltaChunk(value)) {
              const toolCall = ongoingToolCalls[value.output_index]

              if (toolCall != null) {
                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCall.toolCallId,
                  // The delta is code, which is embedding in a JSON string.
                  // To escape it, we use JSON.stringify and slice to remove the outer quotes.
                  delta: JSON.stringify(value.delta).slice(1, -1),
                })
              }
            } else if (isResponseCodeInterpreterCallCodeDoneChunk(value)) {
              const toolCall = ongoingToolCalls[value.output_index]

              if (toolCall != null) {
                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCall.toolCallId,
                  delta: '"}',
                })

                controller.enqueue({
                  type: "tool-input-end",
                  id: toolCall.toolCallId,
                })

                // immediately send the tool call after the input end:
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: toolCall.toolCallId,
                  toolName: "code_interpreter",
                  input: JSON.stringify({
                    code: value.code,
                    containerId: toolCall.codeInterpreter!.containerId,
                  } satisfies z.infer<typeof codeInterpreterInputSchema>),
                  providerExecuted: true,
                })
              }
            } else if (isResponseCreatedChunk(value)) {
              responseId = value.response.id
              controller.enqueue({
                type: "response-metadata",
                id: value.response.id,
                timestamp: new Date(value.response.created_at * 1000),
                modelId: value.response.model,
              })
            } else if (isTextDeltaChunk(value)) {
              // Ensure a text-start exists, and normalize deltas to a stable id
              if (!currentTextId) {
                currentTextId = value.item_id
                controller.enqueue({
                  type: "text-start",
                  id: currentTextId,
                  providerMetadata: {
                    openai: { itemId: value.item_id },
                  },
                })
              }

              controller.enqueue({
                type: "text-delta",
                id: currentTextId,
                delta: value.delta,
              })

              if (options.providerOptions?.openai?.logprobs && value.logprobs) {
                logprobs.push(value.logprobs)
              }
            } else if (isResponseReasoningSummaryPartAddedChunk(value)) {
              const activeItem =
                currentReasoningOutputIndex !== null ? activeReasoning[currentReasoningOutputIndex] : null

              // the first reasoning start is pushed in isResponseOutputItemAddedReasoningChunk.
              if (activeItem && value.summary_index > 0) {
                activeItem.summaryParts.push(value.summary_index)

                controller.enqueue({
                  type: "reasoning-start",
                  id: `${activeItem.canonicalId}:${value.summary_index}`,
                  providerMetadata: {
                    openai: {
                      itemId: activeItem.canonicalId,
                      reasoningEncryptedContent: activeItem.encryptedContent ?? null,
                    },
                  },
                })
              }
            } else if (isResponseReasoningSummaryTextDeltaChunk(value)) {
              const activeItem =
                currentReasoningOutputIndex !== null ? activeReasoning[currentReasoningOutputIndex] : null

              if (activeItem) {
                controller.enqueue({
                  type: "reasoning-delta",
                  id: `${activeItem.canonicalId}:${value.summary_index}`,
                  delta: value.delta,
                  providerMetadata: {
                    openai: {
                      itemId: activeItem.canonicalId,
                    },
                  },
                })
              }
            } else if (isResponseFinishedChunk(value)) {
              finishReason = mapOpenAIResponseFinishReason({
                finishReason: value.response.incomplete_details?.reason,
                hasFunctionCall,
              })
              usage.inputTokens = value.response.usage.input_tokens
              usage.outputTokens = value.response.usage.output_tokens
              usage.totalTokens = value.response.usage.input_tokens + value.response.usage.output_tokens
              usage.reasoningTokens = value.response.usage.output_tokens_details?.reasoning_tokens ?? undefined
              usage.cachedInputTokens = value.response.usage.input_tokens_details?.cached_tokens ?? undefined
              if (typeof value.response.service_tier === "string") {
                serviceTier = value.response.service_tier
              }
            } else if (isResponseAnnotationAddedChunk(value)) {
              if (value.annotation.type === "url_citation") {
                controller.enqueue({
                  type: "source",
                  sourceType: "url",
                  id: self.config.generateId?.() ?? generateId(),
                  url: value.annotation.url,
                  title: value.annotation.title,
                })
              } else if (value.annotation.type === "file_citation") {
                controller.enqueue({
                  type: "source",
                  sourceType: "document",
                  id: self.config.generateId?.() ?? generateId(),
                  mediaType: "text/plain",
                  title: value.annotation.quote ?? value.annotation.filename ?? "Document",
                  filename: value.annotation.filename ?? value.annotation.file_id,
                })
              }
            } else if (isErrorChunk(value)) {
              controller.enqueue({ type: "error", error: value })
            }
          },

          flush(controller) {
            // Close any dangling text part
            if (currentTextId) {
              controller.enqueue({ type: "text-end", id: currentTextId })
              currentTextId = null
            }

            const providerMetadata: SharedV2ProviderMetadata = {
              openai: {
                responseId,
              },
            }

            if (logprobs.length > 0) {
              providerMetadata.openai.logprobs = logprobs
            }

            if (serviceTier !== undefined) {
              providerMetadata.openai.serviceTier = serviceTier
            }

            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
              providerMetadata,
            })
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    }
  }
}

// Re-export types
export type { OpenAIResponsesProviderOptions } from "./response-parser"

