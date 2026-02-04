/**
 * Custom Provider Loaders - Cloud Providers
 * AWS, Google Cloud, Azure configurations
 */
import type { AmazonBedrockProviderSettings } from "@ai-sdk/amazon-bedrock"
import { Config } from "../../../shared/config/config"
import { Auth } from "../../../infrastructure/auth"
import { Env } from "../../../shared/config/env"
import { iife } from "../../../shared/utils/iife"
import { BunProc } from "../../../infrastructure/runtime/bun"
import type { CustomLoader } from "../domain/Provider"

export const cloudLoaders: Record<string, CustomLoader> = {
  azure: async () => {
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
        if (options?.["useCompletionUrls"]) {
          return sdk.chat(modelID)
        } else {
          return sdk.responses(modelID)
        }
      },
      options: {},
    }
  },
  "azure-cognitive-services": async () => {
    const resourceName = Env.get("AZURE_COGNITIVE_SERVICES_RESOURCE_NAME")
    return {
      autoload: false,
      async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
        if (options?.["useCompletionUrls"]) {
          return sdk.chat(modelID)
        } else {
          return sdk.responses(modelID)
        }
      },
      options: {
        baseURL: resourceName ? `https:/${resourceName}.cognitiveservices.azure.com/openai` : undefined,
      },
    }
  },
  "amazon-bedrock": async () => {
    const config = await Config.get()
    const providerConfig = config.provider?.["amazon-bedrock"]

    const auth = await Auth.get("amazon-bedrock")

    // Region precedence: 1) config file, 2) env var, 3) default
    const configRegion = providerConfig?.options?.region
    const envRegion = Env.get("AWS_REGION")
    const defaultRegion = configRegion ?? envRegion ?? "us-east-1"

    // Profile: config file takes precedence over env var
    const configProfile = providerConfig?.options?.profile
    const envProfile = Env.get("AWS_PROFILE")
    const profile = configProfile ?? envProfile

    const awsAccessKeyId = Env.get("AWS_ACCESS_KEY_ID")

    const awsBearerToken = iife(() => {
      const envToken = Env.get("AWS_BEARER_TOKEN_BEDROCK")
      if (envToken) return envToken
      if (auth?.type === "api") {
        Env.set("AWS_BEARER_TOKEN_BEDROCK", auth.key)
        return auth.key
      }
      return undefined
    })

    const awsWebIdentityTokenFile = Env.get("AWS_WEB_IDENTITY_TOKEN_FILE")

    if (!profile && !awsAccessKeyId && !awsBearerToken && !awsWebIdentityTokenFile) return { autoload: false }

    const providerOptions: AmazonBedrockProviderSettings = {
      region: defaultRegion,
    }

    // Only use credential chain if no bearer token exists
    // Bearer token takes precedence over credential chain (profiles, access keys, IAM roles, web identity tokens)
    if (!awsBearerToken) {
      const { fromNodeProviderChain } = await import(await BunProc.install("@aws-sdk/credential-providers"))

      // Build credential provider options (only pass profile if specified)
      const credentialProviderOptions = profile ? { profile } : {}

      providerOptions.credentialProvider = fromNodeProviderChain(credentialProviderOptions)
    }

    // Add custom endpoint if specified (endpoint takes precedence over baseURL)
    const endpoint = providerConfig?.options?.endpoint ?? providerConfig?.options?.baseURL
    if (endpoint) {
      providerOptions.baseURL = endpoint
    }

    return {
      autoload: true,
      options: providerOptions,
      async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
        // Skip region prefixing if model already has a cross-region inference profile prefix
        if (modelID.startsWith("global.") || modelID.startsWith("jp.")) {
          return sdk.languageModel(modelID)
        }

        // Region resolution precedence (highest to lowest):
        // 1. options.region from opencode.json provider config
        // 2. defaultRegion from AWS_REGION environment variable
        // 3. Default "us-east-1" (baked into defaultRegion)
        const region = options?.region ?? defaultRegion

        let regionPrefix = region.split("-")[0]

        switch (regionPrefix) {
          case "us": {
            const modelRequiresPrefix = [
              "nova-micro",
              "nova-lite",
              "nova-pro",
              "nova-premier",
              "nova-2",
              "claude",
              "deepseek",
            ].some((m) => modelID.includes(m))
            const isGovCloud = region.startsWith("us-gov")
            if (modelRequiresPrefix && !isGovCloud) {
              modelID = `${regionPrefix}.${modelID}`
            }
            break
          }
          case "eu": {
            const regionRequiresPrefix = [
              "eu-west-1",
              "eu-west-2",
              "eu-west-3",
              "eu-north-1",
              "eu-central-1",
              "eu-south-1",
              "eu-south-2",
            ].some((r) => region.includes(r))
            const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "llama3", "pixtral"].some((m) =>
              modelID.includes(m),
            )
            if (regionRequiresPrefix && modelRequiresPrefix) {
              modelID = `${regionPrefix}.${modelID}`
            }
            break
          }
          case "ap": {
            const isAustraliaRegion = ["ap-southeast-2", "ap-southeast-4"].includes(region)
            const isTokyoRegion = region === "ap-northeast-1"
            if (
              isAustraliaRegion &&
              ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku"].some((m) => modelID.includes(m))
            ) {
              regionPrefix = "au"
              modelID = `${regionPrefix}.${modelID}`
            } else if (isTokyoRegion) {
              // Tokyo region uses jp. prefix for cross-region inference
              const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                modelID.includes(m),
              )
              if (modelRequiresPrefix) {
                regionPrefix = "jp"
                modelID = `${regionPrefix}.${modelID}`
              }
            } else {
              // Other APAC regions use apac. prefix
              const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                modelID.includes(m),
              )
              if (modelRequiresPrefix) {
                regionPrefix = "apac"
                modelID = `${regionPrefix}.${modelID}`
              }
            }
            break
          }
        }

        return sdk.languageModel(modelID)
      },
    }
  },
  "google-vertex": async () => {
    const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
    const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-east5"
    const autoload = Boolean(project)
    if (!autoload) return { autoload: false }
    return {
      autoload: true,
      options: {
        project,
        location,
      },
      async getModel(sdk: any, modelID: string) {
        const id = String(modelID).trim()
        return sdk.languageModel(id)
      },
    }
  },
  "google-vertex-anthropic": async () => {
    const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
    const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "global"
    const autoload = Boolean(project)
    if (!autoload) return { autoload: false }
    return {
      autoload: true,
      options: {
        project,
        location,
      },
      async getModel(sdk: any, modelID) {
        const id = String(modelID).trim()
        return sdk.languageModel(id)
      },
    }
  },
  "sap-ai-core": async () => {
    const auth = await Auth.get("sap-ai-core")
    const envServiceKey = iife(() => {
      const envAICoreServiceKey = Env.get("AICORE_SERVICE_KEY")
      if (envAICoreServiceKey) return envAICoreServiceKey
      if (auth?.type === "api") {
        Env.set("AICORE_SERVICE_KEY", auth.key)
        return auth.key
      }
      return undefined
    })
    const deploymentId = Env.get("AICORE_DEPLOYMENT_ID")
    const resourceGroup = Env.get("AICORE_RESOURCE_GROUP")

    return {
      autoload: !!envServiceKey,
      options: envServiceKey ? { deploymentId, resourceGroup } : {},
      async getModel(sdk: any, modelID: string) {
        return sdk(modelID)
      },
    }
  },
  "cloudflare-ai-gateway": async (input) => {
    const accountId = Env.get("CLOUDFLARE_ACCOUNT_ID")
    const gateway = Env.get("CLOUDFLARE_GATEWAY_ID")

    if (!accountId || !gateway) return { autoload: false }

    // Get API token from env or auth prompt
    const apiToken = await (async () => {
      const envToken = Env.get("CLOUDFLARE_API_TOKEN")
      if (envToken) return envToken
      const auth = await Auth.get(input.id)
      if (auth?.type === "api") return auth.key
      return undefined
    })()

    return {
      autoload: true,
      async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
        return sdk.languageModel(modelID)
      },
      options: {
        baseURL: `https:/gateway.ai.cloudflare.com/v1/${accountId}/${gateway}/compat`,
        headers: {
          // Cloudflare AI Gateway uses cf-aig-authorization for authenticated gateways
          // This enables Unified Billing where Cloudflare handles upstream provider auth
          ...(apiToken ? { "cf-aig-authorization": `Bearer ${apiToken}` } : {}),
          "HTTP-Referer": "https:/opencode.ai/",
          "X-Title": "opencode",
        },
        // Custom fetch to handle parameter transformation and auth
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers)
          // Strip Authorization header - AI Gateway uses cf-aig-authorization instead
          headers.delete("Authorization")

          // Transform max_tokens to max_completion_tokens for newer models
          if (init?.body && init.method === "POST") {
            try {
              const body = JSON.parse(init.body as string)
              if (body.max_tokens !== undefined && !body.max_completion_tokens) {
                body.max_completion_tokens = body.max_tokens
                delete body.max_tokens
                init = { ...init, body: JSON.stringify(body) }
              }
            } catch (e) {
              // If body parsing fails, continue with original request
            }
          }

          return fetch(input, { ...init, headers })
        },
      },
    }
  },
}
