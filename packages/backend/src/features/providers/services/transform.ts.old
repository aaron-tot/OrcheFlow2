/**
 * Provider Transform - Main Export
 * Purpose: Orchestrates request/response/stream transformations for AI provider APIs
 */
import type { APICallError, ModelMessage } from "ai"
import type { JSONSchema } from "zod/v4/core"
import type { Provider } from "./provider"
import {
  transformMessages,
  transformTemperature,
  transformTopP,
  transformTopK,
  transformProviderOptions,
  transformMaxOutputTokens,
} from "./request-transform"
import { transformSchema, transformError } from "./response-transform"
import { transformVariants, transformOptions, transformSmallOptions } from "./stream-transform"

export namespace ProviderTransform {
  /**
   * Transform messages for API request
   */
  export function message(msgs: ModelMessage[], model: Provider.Model, options: Record<string, unknown>) {
    return transformMessages(msgs, model, options)
  }

  /**
   * Get optimal temperature for model
   */
  export function temperature(model: Provider.Model) {
    return transformTemperature(model)
  }

  /**
   * Get optimal top_p for model
   */
  export function topP(model: Provider.Model) {
    return transformTopP(model)
  }

  /**
   * Get optimal top_k for model
   */
  export function topK(model: Provider.Model) {
    return transformTopK(model)
  }

  /**
   * Get reasoning effort variants for model
   */
  export function variants(model: Provider.Model): Record<string, Record<string, any>> {
    return transformVariants(model)
  }

  /**
   * Get provider-specific options
   */
  export function options(input: {
    model: Provider.Model
    sessionID: string
    providerOptions?: Record<string, any>
  }): Record<string, any> {
    return transformOptions(input)
  }

  /**
   * Get small/minimal options for model
   */
  export function smallOptions(model: Provider.Model) {
    return transformSmallOptions(model)
  }

  /**
   * Wrap options in provider-specific key
   */
  export function providerOptions(model: Provider.Model, options: { [x: string]: any }) {
    return transformProviderOptions(model, options)
  }

  /**
   * Calculate max output tokens considering reasoning budget
   */
  export function maxOutputTokens(
    npm: string,
    options: Record<string, any>,
    modelLimit: number,
    globalLimit: number,
  ): number {
    return transformMaxOutputTokens(npm, options, modelLimit, globalLimit)
  }

  /**
   * Transform JSON schema for provider compatibility
   */
  export function schema(model: Provider.Model, schema: JSONSchema.BaseSchema) {
    return transformSchema(model, schema)
  }

  /**
   * Transform API errors into user-friendly messages
   */
  export function error(providerID: string, error: APICallError) {
    return transformError(providerID, error)
  }
}

