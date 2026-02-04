/**
 * Custom Provider Loaders - AI Services
 * AI-first services (Anthropic, OpenAI, OpenRouter, etc.)
 */
import { Config } from "../../../shared/config/config"
import { Auth } from "../../../infrastructure/auth"
import { Env } from "../../../shared/config/env"
import { Log } from "../../../shared/utils/log"
import type { CustomLoader } from "../domain/Provider"
import { shouldUseCopilotResponsesApi } from "./BundledProviders"

const log = Log.create({ service: "ai-service-loaders" })

export const aiServiceLoaders: Record<string, CustomLoader> = {
  async anthropic() {
    return {
      autoload: false,
      options: {
        headers: {
          "anthropic-beta":
            "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
        },
      },
    }
  },
  async opencode(input) {
    const hasKey = await (async () => {
      const env = Env.all()
      if (input.env.some((item) => env[item])) return true
      if (await Auth.get(input.id)) return true
      const config = await Config.get()
      if (config.provider?.["opencode"]?.options?.apiKey) return true
      return false
    })()

    if (!hasKey) {
      for (const [key, value] of Object.entries(input.models)) {
        if (value.cost.input === 0) continue
        delete input.models[key]
      }
    }

    return {
      autoload: Object.keys(input.models).length > 0,
      options: hasKey ? {} : { apiKey: "public" },
    }
  },
  openai: async () => {
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
        return sdk.responses(modelID)
      },
      options: {},
    }
  },
  "github-copilot": async () => {
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
        return shouldUseCopilotResponsesApi(modelID) ? sdk.responses(modelID) : sdk.chat(modelID)
      },
      options: {},
    }
  },
  "github-copilot-enterprise": async () => {
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
        return shouldUseCopilotResponsesApi(modelID) ? sdk.responses(modelID) : sdk.chat(modelID)
      },
      options: {},
    }
  },
  openrouter: async () => {
    return {
      autoload: false,
      options: {
        headers: {
          "HTTP-Referer": "https:/opencode.ai/",
          "X-Title": "opencode",
        },
      },
    }
  },
  vercel: async () => {
    return {
      autoload: false,
      options: {
        headers: {
          "http-referer": "https:/opencode.ai/",
          "x-title": "opencode",
        },
      },
    }
  },
  cerebras: async () => {
    return {
      autoload: false,
      options: {
        headers: {
          "X-Cerebras-3rd-Party-Integration": "opencode",
        },
      },
    }
  },
}
