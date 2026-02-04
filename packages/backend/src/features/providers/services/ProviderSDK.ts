/**
 * Provider SDK Management
 * SDK instance creation and caching
 */
import { NoSuchModelError, type Provider as SDK } from "ai"
import type { LanguageModelV2 } from "@openrouter/ai-sdk-provider"
import { Log } from "../../../shared/utils/log"
import { BunProc } from "../../../infrastructure/runtime/bun"
import type { Model } from "../domain/Provider"
import { ModelNotFoundError, InitError } from "../domain/ProviderErrors"
import { BUNDLED_PROVIDERS } from "../infrastructure/BundledProviders"

const log = Log.create({ service: "provider-sdk" })

export async function getSDK(model: Model, state: any) {
  try {
    using _ = log.time("getSDK", {
      providerID: model.providerID,
    })
    const provider = state.providers[model.providerID]
    const options = { ...provider.options }

    if (model.api.npm.includes("@ai-sdk/openai-compatible") && options["includeUsage"] !== false) {
      options["includeUsage"] = true
    }

    if (!options["baseURL"]) options["baseURL"] = model.api.url
    if (options["apiKey"] === undefined && provider.key) options["apiKey"] = provider.key
    if (model.headers)
      options["headers"] = {
        ...options["headers"],
        ...model.headers,
      }

    const key = Bun.hash.xxHash32(JSON.stringify({ npm: model.api.npm, options }))
    const existing = state.sdk.get(key)
    if (existing) return existing

    const customFetch = options["fetch"]

    options["fetch"] = async (input: any, init?: BunFetchRequestInit) => {
      // Preserve custom fetch if it exists, wrap it with timeout logic
      const fetchFn = customFetch ?? fetch
      const opts = init ?? {}

      if (options["timeout"] !== undefined && options["timeout"] !== null) {
        const signals: AbortSignal[] = []
        if (opts.signal) signals.push(opts.signal)
        if (options["timeout"] !== false) signals.push(AbortSignal.timeout(options["timeout"]))

        const combined = signals.length > 1 ? AbortSignal.any(signals) : signals[0]

        opts.signal = combined
      }

      // Strip openai itemId metadata following what codex does
      // Codex uses #[serde(skip_serializing)] on id fields for all item types:
      // Message, Reasoning, FunctionCall, LocalShellCall, CustomToolCall, WebSearchCall
      // IDs are only re-attached for Azure with store=true
      if (model.api.npm === "@ai-sdk/openai" && opts.body && opts.method === "POST") {
        const body = JSON.parse(opts.body as string)
        const isAzure = model.providerID.includes("azure")
        const keepIds = isAzure && body.store === true
        if (!keepIds && Array.isArray(body.input)) {
          for (const item of body.input) {
            if ("id" in item) {
              delete item.id
            }
          }
          opts.body = JSON.stringify(body)
        }
      }

      return fetchFn(input, {
        ...opts,
        // @ts-ignore see here: https:/github.com/oven-sh/bun/issues/16682
        timeout: false,
      })
    }

    // Special case: google-vertex-anthropic uses a subpath import
    const bundledKey =
      model.providerID === "google-vertex-anthropic" ? "@ai-sdk/google-vertex/anthropic" : model.api.npm
    const bundledFn = BUNDLED_PROVIDERS[bundledKey]
    if (bundledFn) {
      log.info("using bundled provider", { providerID: model.providerID, pkg: bundledKey })
      const loaded = bundledFn({
        name: model.providerID,
        ...options,
      })
      state.sdk.set(key, loaded)
      return loaded as SDK
    }

    let installedPath: string
    if (!model.api.npm.startsWith("file:/")) {
      installedPath = await BunProc.install(model.api.npm, "latest")
    } else {
      log.info("loading local provider", { pkg: model.api.npm })
      installedPath = model.api.npm
    }

    const mod = await import(installedPath)

    const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
    const loaded = fn({
      name: model.providerID,
      ...options,
    })
    state.sdk.set(key, loaded)
    return loaded as SDK
  } catch (e) {
    throw new InitError({ providerID: model.providerID }, { cause: e })
  }
}

export async function getLanguage(model: Model, state: any): Promise<LanguageModelV2> {
  const key = `${model.providerID}/${model.id}`
  if (state.models.has(key)) return state.models.get(key)!

  const provider = state.providers[model.providerID]
  const sdk = await getSDK(model, state)

  try {
    const language = state.modelLoaders[model.providerID]
      ? await state.modelLoaders[model.providerID](sdk, model.api.id, provider.options)
      : sdk.languageModel(model.api.id)
    state.models.set(key, language)
    return language
  } catch (e) {
    if (e instanceof NoSuchModelError)
      throw new ModelNotFoundError(
        {
          modelID: model.id,
          providerID: model.providerID,
        },
        { cause: e },
      )
    throw e
  }
}
