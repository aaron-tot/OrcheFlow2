/**
 * Message Parser
 * Purpose: Message parsing, error handling, and data extraction
 */
import z from "zod"
import { NamedError } from "@opencode-ai/util"
import { APICallError, LoadAPIKeyError } from "ai"
import { fn } from "@opencode-ai/util"
import { Identifier } from "../../../shared/utils/id/id"
import { Storage } from "../../../infrastructure/storage/storage"
import { ProviderTransform } from "../../providers/services/transform"
import { STATUS_CODES } from "http"
import { iife } from "../../../shared/utils/iife"
import { type SystemError } from "bun"
import { MessageValidator } from "./message-validator"

export namespace MessageParser {
  /**
   * Stream messages for a session
   */
  export const stream = fn(Identifier.schema("session"), async function* (sessionID) {
    const list = await Array.fromAsync(await Storage.list(["message", sessionID]))
    for (let i = list.length - 1; i >= 0; i--) {
      yield await get({
        sessionID,
        messageID: list[i][2],
      })
    }
  })

  /**
   * Get all parts for a message
   */
  export const parts = fn(Identifier.schema("message"), async (messageID) => {
    const result = [] as MessageValidator.Part[]
    for (const item of await Storage.list(["part", messageID])) {
      const read = await Storage.read<MessageValidator.Part>(item)
      result.push(read)
    }
    result.sort((a, b) => (a.id > b.id ? 1 : -1))
    return result
  })

  /**
   * Get a complete message with all its parts
   */
  export const get = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input): Promise<MessageValidator.WithParts> => {
      return {
        info: await Storage.read<MessageValidator.Info>(["message", input.sessionID, input.messageID]),
        parts: await parts(input.messageID),
      }
    },
  )

  /**
   * Helper to determine if OpenAI errors are retryable
   */
  const isOpenAiErrorRetryable = (e: APICallError) => {
    const status = e.statusCode
    if (!status) return e.isRetryable
    // openai sometimes returns 404 for models that are actually available
    return status === 404 || e.isRetryable
  }

  /**
   * Convert various error types to MessageV2 error format
   */
  export function fromError(e: unknown, ctx: { providerID: string }) {
    switch (true) {
      case e instanceof DOMException && e.name === "AbortError":
        return new MessageValidator.AbortedError(
          { message: e.message },
          {
            cause: e,
          },
        ).toObject()
      case (e as any)?.name === "MessageOutputLengthError":
        return e
      case LoadAPIKeyError.isInstance(e):
        return new MessageValidator.AuthError(
          {
            providerID: ctx.providerID,
            message: e.message,
          },
          { cause: e },
        ).toObject()
      case (e as SystemError)?.code === "ECONNRESET":
        return new MessageValidator.APIError(
          {
            message: "Connection reset by server",
            isRetryable: true,
            metadata: {
              code: (e as SystemError).code ?? "",
              syscall: (e as SystemError).syscall ?? "",
              message: (e as SystemError).message ?? "",
            },
          },
          { cause: e },
        ).toObject()
      case APICallError.isInstance(e):
        const message = iife(() => {
          let msg = e.message
          if (msg === "") {
            if (e.responseBody) return e.responseBody
            if (e.statusCode) {
              const err = STATUS_CODES[e.statusCode]
              if (err) return err
            }
            return "Unknown error"
          }
          const transformed = ProviderTransform.error(ctx.providerID, e)
          if (transformed !== msg) {
            return transformed
          }
          if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
            return msg
          }

          try {
            const body = JSON.parse(e.responseBody)
            // try to extract common error message fields
            const errMsg = body.message || body.error || body.error?.message
            if (errMsg && typeof errMsg === "string") {
              return `${msg}: ${errMsg}`
            }
          } catch {}

          return `${msg}: ${e.responseBody}`
        }).trim()

        const metadata = e.url ? { url: e.url } : undefined
        return new MessageValidator.APIError(
          {
            message,
            statusCode: e.statusCode,
            isRetryable: ctx.providerID.startsWith("openai") ? isOpenAiErrorRetryable(e) : e.isRetryable,
            responseHeaders: e.responseHeaders,
            responseBody: e.responseBody,
            metadata,
          },
          { cause: e },
        ).toObject()
      case e instanceof Error:
        return new NamedError.Unknown({ message: e.toString() }).toObject()
      default:
        return new NamedError.Unknown({ message: JSON.stringify(e) }).toObject()
    }
  }
}
