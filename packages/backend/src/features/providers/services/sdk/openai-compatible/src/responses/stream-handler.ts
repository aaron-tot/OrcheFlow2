/**
 * Stream Handler - OpenAI Responses API
 * Purpose: Stream processing and SSE handling
 */

import { z } from "zod/v4"
import {
  textDeltaChunkSchema,
  errorChunkSchema,
  responseFinishedChunkSchema,
  responseCreatedChunkSchema,
  responseOutputItemAddedSchema,
  responseOutputItemDoneSchema,
  responseFunctionCallArgumentsDeltaSchema,
  responseImageGenerationCallPartialImageSchema,
  responseCodeInterpreterCallCodeDeltaSchema,
  responseCodeInterpreterCallCodeDoneSchema,
  responseAnnotationAddedSchema,
  responseReasoningSummaryPartAddedSchema,
  responseReasoningSummaryTextDeltaSchema,
  openaiResponsesChunkSchema,
  LOGPROBS_SCHEMA,
} from "./response-parser"
import { codeInterpreterInputSchema } from "./tool/code-interpreter"
import { fileSearchOutputSchema } from "./tool/file-search"
import { imageGenerationOutputSchema } from "./tool/image-generation"
import { localShellInputSchema } from "./tool/local-shell"

type ExtractByType<T, K extends T extends { type: infer U } ? U : never> = T extends { type: K } ? T : never

export function isTextDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof textDeltaChunkSchema> {
  return chunk.type === "response.output_text.delta"
}

export function isResponseOutputItemDoneChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemDoneSchema> {
  return chunk.type === "response.output_item.done"
}

export function isResponseOutputItemDoneReasoningChunk(chunk: z.infer<typeof openaiResponsesChunkSchema>): chunk is z.infer<
  typeof responseOutputItemDoneSchema
> & {
  item: ExtractByType<z.infer<typeof responseOutputItemDoneSchema>["item"], "reasoning">
} {
  return isResponseOutputItemDoneChunk(chunk) && chunk.item.type === "reasoning"
}

export function isResponseFinishedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseFinishedChunkSchema> {
  return chunk.type === "response.completed" || chunk.type === "response.incomplete"
}

export function isResponseCreatedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseCreatedChunkSchema> {
  return chunk.type === "response.created"
}

export function isResponseFunctionCallArgumentsDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseFunctionCallArgumentsDeltaSchema> {
  return chunk.type === "response.function_call_arguments.delta"
}

export function isResponseImageGenerationCallPartialImageChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseImageGenerationCallPartialImageSchema> {
  return chunk.type === "response.image_generation_call.partial_image"
}

export function isResponseCodeInterpreterCallCodeDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseCodeInterpreterCallCodeDeltaSchema> {
  return chunk.type === "response.code_interpreter_call_code.delta"
}

export function isResponseCodeInterpreterCallCodeDoneChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseCodeInterpreterCallCodeDoneSchema> {
  return chunk.type === "response.code_interpreter_call_code.done"
}

export function isResponseOutputItemAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseOutputItemAddedSchema> {
  return chunk.type === "response.output_item.added"
}

export function isResponseOutputItemAddedReasoningChunk(chunk: z.infer<typeof openaiResponsesChunkSchema>): chunk is z.infer<
  typeof responseOutputItemAddedSchema
> & {
  item: ExtractByType<z.infer<typeof responseOutputItemAddedSchema>["item"], "reasoning">
} {
  return isResponseOutputItemAddedChunk(chunk) && chunk.item.type === "reasoning"
}

export function isResponseAnnotationAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseAnnotationAddedSchema> {
  return chunk.type === "response.output_text.annotation.added"
}

export function isResponseReasoningSummaryPartAddedChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseReasoningSummaryPartAddedSchema> {
  return chunk.type === "response.reasoning_summary_part.added"
}

export function isResponseReasoningSummaryTextDeltaChunk(
  chunk: z.infer<typeof openaiResponsesChunkSchema>,
): chunk is z.infer<typeof responseReasoningSummaryTextDeltaSchema> {
  return chunk.type === "response.reasoning_summary_text.delta"
}

export function isErrorChunk(chunk: z.infer<typeof openaiResponsesChunkSchema>): chunk is z.infer<typeof errorChunkSchema> {
  return chunk.type === "error"
}

export { 
  codeInterpreterInputSchema, 
  fileSearchOutputSchema, 
  imageGenerationOutputSchema,
  localShellInputSchema,
  LOGPROBS_SCHEMA
}
