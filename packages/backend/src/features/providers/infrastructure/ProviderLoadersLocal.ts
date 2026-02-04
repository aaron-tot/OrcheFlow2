/**
 * Custom Provider Loaders - Local & Special Providers
 * Ollama, GitLab, Zenmux
 */
import { createGitLab } from "@gitlab/gitlab-ai-provider"
import { Config } from "../../../shared/config/config"
import { Auth } from "../../../infrastructure/auth"
import { Env } from "../../../shared/config/env"
import { Log } from "../../../shared/utils/log"
import type { CustomLoader } from "../domain/Provider"

const log = Log.create({ service: "local-loaders" })

export const localLoaders: Record<string, CustomLoader> = {
  "ollama-local": async (input) => {
    // Check if we have local auth configured
    const auth = await Auth.get("ollama-local")
    if (!auth || auth.type !== "local") {
      return {
        autoload: false,
      }
    }

    try {
      // Import refreshOllamaModels dynamically to avoid circular dependency
      const { Provider } = await import("../services/provider")
      const models = await Provider.refreshOllamaModels()
      input.models = models
      const baseUrl = `${auth.url}:${auth.port}`

      return {
        autoload: true,
        options: {
          baseURL: `${baseUrl}/v1`,
        },
      }
    } catch (error) {
      log.error("Failed to fetch Ollama models", { error })
      return {
        autoload: false,
      }
    }
  },
  zenmux: async () => {
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
  gitlab: async (input) => {
    const instanceUrl = Env.get("GITLAB_INSTANCE_URL") || "https:/gitlab.com"

    const auth = await Auth.get(input.id)
    const apiKey = await (async () => {
      if (auth?.type === "oauth") return auth.access
      if (auth?.type === "api") return auth.key
      return Env.get("GITLAB_TOKEN")
    })()

    const config = await Config.get()
    const providerConfig = config.provider?.["gitlab"]

    return {
      autoload: !!apiKey,
      options: {
        instanceUrl,
        apiKey,
        featureFlags: {
          duo_agent_platform_agentic_chat: true,
          duo_agent_platform: true,
          ...(providerConfig?.options?.featureFlags || {}),
        },
      },
      async getModel(sdk: ReturnType<typeof createGitLab>, modelID: string) {
        return sdk.agenticChat(modelID, {
          featureFlags: {
            duo_agent_platform_agentic_chat: true,
            duo_agent_platform: true,
            ...(providerConfig?.options?.featureFlags || {}),
          },
        })
      },
    }
  },
}
