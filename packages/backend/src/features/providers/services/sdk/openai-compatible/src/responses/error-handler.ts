/**
 * Error Handler - OpenAI Responses API
 * Purpose: Error handling and retries
 */

import { APICallError } from "@ai-sdk/provider"
import { openaiFailedResponseHandler } from "./openai-error"

export { openaiFailedResponseHandler }

/**
 * Creates an API call error with standardized format
 */
export function createAPIError({
  message,
  url,
  requestBodyValues,
  statusCode,
  responseHeaders,
  responseBody,
  isRetryable = false,
}: {
  message: string
  url: string
  requestBodyValues: unknown
  statusCode: number
  responseHeaders?: Record<string, string>
  responseBody?: string
  isRetryable?: boolean
}): APICallError {
  return new APICallError({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseHeaders,
    responseBody,
    isRetryable,
  })
}

/**
 * Handles response errors from the API
 */
export function handleResponseError({
  response,
  url,
  body,
  responseHeaders,
  rawResponse,
}: {
  response: { error?: { code: string; message: string } }
  url: string
  body: unknown
  responseHeaders?: Record<string, string>
  rawResponse: string
}): never {
  if (response.error) {
    throw createAPIError({
      message: response.error.message,
      url,
      requestBodyValues: body,
      statusCode: 400,
      responseHeaders,
      responseBody: rawResponse,
      isRetryable: false,
    })
  }
  
  // This should never be reached due to TypeScript's never return type
  throw new Error("Unexpected error handling state")
}
