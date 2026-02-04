/**
 * Provider - LLM provider interface and factory
 * Orchestrates provider loading, model discovery, and SDK creation
 */
import fuzzysort from "fuzzysort"
import type { LanguageModelV2 } from "@openrouter/ai-sdk-provider"
import { Log } from "../../../shared/utils/log"

// Import from new modules
import { Model as ModelSchema, Info as InfoSchema } from "../domain/Provider"
import type { Model as ModelType, Info as InfoType } from "../domain/Provider"
import { ModelNotFoundError, InitError } from "../domain/ProviderErrors"
import { state, fromModelsDevProvider as convertModelsDevProvider } from "./ProviderInitialization"
import * as ProviderSDK from "./ProviderSDK"
import * as ProviderUtils from "./ProviderUtils"

export namespace Provider {
  const log = Log.create({ service: "provider" })

  // Re-export types and schemas
  export type Model = ModelType
  export type Info = InfoType
  export const Model = ModelSchema
  export const Info = InfoSchema
  
  // Re-export errors
  export const ModelNotFoundError = ModelNotFoundError
  export const InitError = InitError
  
  // Re-export utility functions
  export const fromModelsDevProvider = convertModelsDevProvider

  export async function list() {
    return state().then((state) => state.providers)
  }

  export async function getProvider(providerID: string) {
    return state().then((s) => s.providers[providerID])
  }

  export async function getModel(providerID: string, modelID: string) {
    const s = await state()
    const provider = s.providers[providerID]
    if (!provider) {
      const availableProviders = Object.keys(s.providers)
      const matches = fuzzysort.go(providerID, availableProviders, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }

    const info = provider.models[modelID]
    if (!info) {
      const availableModels = Object.keys(provider.models)
      const matches = fuzzysort.go(modelID, availableModels, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }
    return info
  }

  export async function getLanguage(model: Model): Promise<LanguageModelV2> {
    const s = await state()
    return ProviderSDK.getLanguage(model, s)
  }

  export async function closest(providerID: string, query: string[]) {
    const s = await state()
    return ProviderUtils.closest(providerID, query, s)
  }

  export async function refreshOllamaModels() {
    return ProviderUtils.refreshOllamaModels()
  }

  export async function getSmallModel(providerID: string) {
    const s = await state()
    return ProviderUtils.getSmallModel(providerID, s, getModel)
  }

  export function sort(models: Model[]) {
    return ProviderUtils.sort(models)
  }

  export async function defaultModel() {
    const providers = await list()
    return ProviderUtils.defaultModel(providers, getModel)
  }

  export function parseModel(model: string) {
    return ProviderUtils.parseModel(model)
  }
}

