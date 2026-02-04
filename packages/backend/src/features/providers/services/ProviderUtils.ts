/**
 * Provider Utilities
 * Helper functions for provider operations
 */
import path from "path"
import fuzzysort from "fuzzysort"
import { sortBy } from "remeda"
import { Config } from "../../../shared/config/config"
import { Auth } from "../../../infrastructure/auth"
import { Log } from "../../../shared/utils/log"
import { ModelsDev } from "./models"
import type { Model } from "../domain/Provider"

const log = Log.create({ service: "provider-utils" })

export async function closest(providerID: string, query: string[], state: any) {
  const provider = state.providers[providerID]
  if (!provider) return undefined
  for (const item of query) {
    for (const modelID of Object.keys(provider.models)) {
      if (modelID.includes(item))
        return {
          providerID,
          modelID,
        }
    }
  }
}

export async function refreshOllamaModels() {
  const auth = await Auth.get("ollama-local")
  if (!auth || auth.type !== "local") {
    throw new Error("Ollama local auth not configured")
  }

  // Fetch available models from Ollama API
  const baseUrl = `${auth.url}:${auth.port}`
  const response = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.status}`)
  }

  const data = await response.json()
  const models: Record<string, any> = {}

  // Transform Ollama models to our format
  for (const model of data.models || []) {
    const modelId = model.name
    models[modelId] = {
      id: modelId,
      name: model.name,
      family: model.details?.family || "unknown",
      release_date: model.modified_at?.split("T")[0] || new Date().toISOString().split("T")[0],
      attachment: false,
      reasoning: false,
      temperature: true,
      tool_call: true,
      limit: {
        context: 128000,
        output: 8192,
      },
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      options: {},
    }
  }

  // Write updated models back to the file - use path relative to this file
  const localApiPath = path.join(import.meta.dirname, "models-local-api.json")
  const fileData = {
    "ollama-local": {
      name: "Ollama Local",
      env: [],
      id: "ollama-local",
      npm: "@ai-sdk/openai-compatible",
      api: `${baseUrl}/v1`, // Base URL for the provider - REQUIRED for model.api.url resolution
      models: models,
    },
  }

  log.info(`[RefreshOllama] Writing ${Object.keys(models).length} models to: ${localApiPath}`)
  await Bun.write(localApiPath, JSON.stringify(fileData, null, 2))
  log.info(`[RefreshOllama] Successfully updated models file with models:`, Object.keys(models))

  // Invalidate provider state cache so models are reloaded
  // The state() function caches the provider list, we need to dispose and recreate it
  // by calling ModelsDev.get() again which will re-read the file
  try {
    await ModelsDev.invalidate()
  } catch (e) {
    log.warn("[RefreshOllama] Failed to invalidate ModelsDev cache, models may not appear until restart", {
      error: e,
    })
  }

  return models
}

export async function getSmallModel(providerID: string, state: any, getModel: (providerID: string, modelID: string) => Promise<Model>) {
  const cfg = await Config.get()

  if (cfg.small_model) {
    const parsed = parseModel(cfg.small_model)
    return getModel(parsed.providerID, parsed.modelID)
  }

  const provider = state.providers[providerID]
  if (provider) {
    let priority = [
      "claude-haiku-4-5",
      "claude-haiku-4.5",
      "3-5-haiku",
      "3.5-haiku",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gpt-5-nano",
    ]
    if (providerID.startsWith("opencode")) {
      priority = ["gpt-5-nano"]
    }
    if (providerID.startsWith("github-copilot")) {
      // prioritize free models for github copilot
      priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority]
    }
    for (const item of priority) {
      for (const model of Object.keys(provider.models)) {
        if (model.includes(item)) return getModel(providerID, model)
      }
    }
  }

  // Check if opencode provider is available before using it
  const opencodeProvider = state.providers["opencode"]
  if (opencodeProvider && opencodeProvider.models["gpt-5-nano"]) {
    return getModel("opencode", "gpt-5-nano")
  }

  return undefined
}

const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
export function sort(models: Model[]) {
  return sortBy(
    models,
    [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
    [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
    [(model) => model.id, "desc"],
  )
}

export async function defaultModel(providers: Record<string, any>, getModel: (providerID: string, modelID: string) => Promise<Model>) {
  const cfg = await Config.get()
  if (cfg.model) return parseModel(cfg.model)

  const provider = Object.values(providers).find(
    (p: any) => !cfg.provider || Object.keys(cfg.provider).includes(p.id),
  )
  if (!provider) throw new Error("no providers found")
  const [model] = sort(Object.values(provider.models))
  if (!model) throw new Error("no models found")
  return {
    providerID: provider.id,
    modelID: model.id,
  }
}

export function parseModel(model: string) {
  const [providerID, ...rest] = model.split("/")
  return {
    providerID: providerID,
    modelID: rest.join("/"),
  }
}
