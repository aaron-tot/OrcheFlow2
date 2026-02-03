/**
 * Stream Transformation Logic
 * Purpose: Transforms streaming options, reasoning variants, and model-specific configurations
 */
import type { Provider } from "./provider"
import { iife } from "../../../shared/utils/iife"

const WIDELY_SUPPORTED_EFFORTS = ["low", "medium", "high"]
const OPENAI_EFFORTS = ["none", "minimal", ...WIDELY_SUPPORTED_EFFORTS, "xhigh"]

export function transformVariants(model: Provider.Model): Record<string, Record<string, any>> {
  if (!model.capabilities.reasoning) return {}

  const id = model.id.toLowerCase()
  if (id.includes("deepseek") || id.includes("minimax") || id.includes("glm") || id.includes("mistral")) return {}

  // see: https:/docs.x.ai/docs/guides/reasoning#control-how-hard-the-model-thinks
  if (id.includes("grok") && id.includes("grok-3-mini")) {
    if (model.api.npm === "@openrouter/ai-sdk-provider") {
      return {
        low: { reasoning: { effort: "low" } },
        high: { reasoning: { effort: "high" } },
      }
    }
    return {
      low: { reasoningEffort: "low" },
      high: { reasoningEffort: "high" },
    }
  }
  if (id.includes("grok")) return {}

  switch (model.api.npm) {
    case "@openrouter/ai-sdk-provider":
      if (!model.id.includes("gpt") && !model.id.includes("gemini-3")) return {}
      return Object.fromEntries(OPENAI_EFFORTS.map((effort) => [effort, { reasoning: { effort } }]))

    // TODO: YOU CANNOT SET max_tokens if this is set!!!
    case "@ai-sdk/gateway":
      return Object.fromEntries(OPENAI_EFFORTS.map((effort) => [effort, { reasoningEffort: effort }]))

    case "@ai-sdk/github-copilot":
      return Object.fromEntries(
        WIDELY_SUPPORTED_EFFORTS.map((effort) => [
          effort,
          {
            reasoningEffort: effort,
            reasoningSummary: "auto",
            include: ["reasoning.encrypted_content"],
          },
        ]),
      )

    case "@ai-sdk/cerebras":
    // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/cerebras
    case "@ai-sdk/togetherai":
    // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/togetherai
    case "@ai-sdk/xai":
    // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/xai
    case "@ai-sdk/deepinfra":
    // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/deepinfra
    case "@ai-sdk/openai-compatible":
      return Object.fromEntries(WIDELY_SUPPORTED_EFFORTS.map((effort) => [effort, { reasoningEffort: effort }]))

    case "@ai-sdk/azure":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/azure
      if (id === "o1-mini") return {}
      const azureEfforts = ["low", "medium", "high"]
      if (id.includes("gpt-5-") || id === "gpt-5") {
        azureEfforts.unshift("minimal")
      }
      return Object.fromEntries(
        azureEfforts.map((effort) => [
          effort,
          {
            reasoningEffort: effort,
            reasoningSummary: "auto",
            include: ["reasoning.encrypted_content"],
          },
        ]),
      )
    case "@ai-sdk/openai":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/openai
      if (id === "gpt-5-pro") return {}
      const openaiEfforts = iife(() => {
        if (id.includes("codex")) {
          if (id.includes("5.2")) return [...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
          return WIDELY_SUPPORTED_EFFORTS
        }
        const arr = [...WIDELY_SUPPORTED_EFFORTS]
        if (id.includes("gpt-5-") || id === "gpt-5") {
          arr.unshift("minimal")
        }
        if (model.release_date >= "2025-11-13") {
          arr.unshift("none")
        }
        if (model.release_date >= "2025-12-04") {
          arr.push("xhigh")
        }
        return arr
      })
      return Object.fromEntries(
        openaiEfforts.map((effort) => [
          effort,
          {
            reasoningEffort: effort,
            reasoningSummary: "auto",
            include: ["reasoning.encrypted_content"],
          },
        ]),
      )

    case "@ai-sdk/anthropic":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/anthropic
      return {
        high: {
          thinking: {
            type: "enabled",
            budgetTokens: 16000,
          },
        },
        max: {
          thinking: {
            type: "enabled",
            budgetTokens: 31999,
          },
        },
      }

    case "@ai-sdk/amazon-bedrock":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock
      // For Anthropic models on Bedrock, use reasoningConfig with budgetTokens
      if (model.api.id.includes("anthropic")) {
        return {
          high: {
            reasoningConfig: {
              type: "enabled",
              budgetTokens: 16000,
            },
          },
          max: {
            reasoningConfig: {
              type: "enabled",
              budgetTokens: 31999,
            },
          },
        }
      }

      // For Amazon Nova models, use reasoningConfig with maxReasoningEffort
      return Object.fromEntries(
        WIDELY_SUPPORTED_EFFORTS.map((effort) => [
          effort,
          {
            reasoningConfig: {
              type: "enabled",
              maxReasoningEffort: effort,
            },
          },
        ]),
      )

    case "@ai-sdk/google-vertex":
    // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/google-vertex
    case "@ai-sdk/google":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai
      if (id.includes("2.5")) {
        return {
          high: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 16000,
            },
          },
          max: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 24576,
            },
          },
        }
      }
      return Object.fromEntries(
        ["low", "high"].map((effort) => [
          effort,
          {
            includeThoughts: true,
            thinkingLevel: effort,
          },
        ]),
      )

    case "@ai-sdk/mistral":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/mistral
      return {}

    case "@ai-sdk/cohere":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/cohere
      return {}

    case "@ai-sdk/groq":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/groq
      const groqEffort = ["none", ...WIDELY_SUPPORTED_EFFORTS]
      return Object.fromEntries(
        groqEffort.map((effort) => [
          effort,
          {
            includeThoughts: true,
            thinkingLevel: effort,
          },
        ]),
      )

    case "@ai-sdk/perplexity":
      // https:/v5.ai-sdk.dev/providers/ai-sdk-providers/perplexity
      return {}
  }
  return {}
}

export function transformOptions(input: {
  model: Provider.Model
  sessionID: string
  providerOptions?: Record<string, any>
}): Record<string, any> {
  const result: Record<string, any> = {}

  // openai and providers using openai package should set store to false by default.
  if (
    input.model.providerID === "openai" ||
    input.model.api.npm === "@ai-sdk/openai" ||
    input.model.api.npm === "@ai-sdk/github-copilot"
  ) {
    result["store"] = false
  }

  if (input.model.api.npm === "@openrouter/ai-sdk-provider") {
    result["usage"] = {
      include: true,
    }
    if (input.model.api.id.includes("gemini-3")) {
      result["reasoning"] = { effort: "high" }
    }
  }

  if (
    input.model.providerID === "baseten" ||
    (input.model.providerID === "opencode" && ["kimi-k2-thinking", "glm-4.6"].includes(input.model.api.id))
  ) {
    result["chat_template_args"] = { enable_thinking: true }
  }

  if (["zai", "zhipuai"].includes(input.model.providerID) && input.model.api.npm === "@ai-sdk/openai-compatible") {
    result["thinking"] = {
      type: "enabled",
      clear_thinking: false,
    }
  }

  if (input.model.providerID === "openai" || input.providerOptions?.setCacheKey) {
    result["promptCacheKey"] = input.sessionID
  }

  if (input.model.api.npm === "@ai-sdk/google" || input.model.api.npm === "@ai-sdk/google-vertex") {
    result["thinkingConfig"] = {
      includeThoughts: true,
    }
    if (input.model.api.id.includes("gemini-3")) {
      result["thinkingConfig"]["thinkingLevel"] = "high"
    }
  }

  if (input.model.api.id.includes("gpt-5") && !input.model.api.id.includes("gpt-5-chat")) {
    if (input.model.providerID.includes("codex")) {
      result["store"] = false
    }

    if (!input.model.api.id.includes("codex") && !input.model.api.id.includes("gpt-5-pro")) {
      result["reasoningEffort"] = "medium"
    }

    if (input.model.api.id.endsWith("gpt-5.") && input.model.providerID !== "azure") {
      result["textVerbosity"] = "low"
    }

    if (input.model.providerID.startsWith("opencode")) {
      result["promptCacheKey"] = input.sessionID
      result["include"] = ["reasoning.encrypted_content"]
      result["reasoningSummary"] = "auto"
    }
  }
  return result
}

export function transformSmallOptions(model: Provider.Model) {
  if (model.providerID === "openai" || model.api.id.includes("gpt-5")) {
    if (model.api.id.includes("5.")) {
      return { reasoningEffort: "low" }
    }
    return { reasoningEffort: "minimal" }
  }
  if (model.providerID === "google") {
    // gemini-3 uses thinkingLevel, gemini-2.5 uses thinkingBudget
    if (model.api.id.includes("gemini-3")) {
      return { thinkingConfig: { thinkingLevel: "minimal" } }
    }
    return { thinkingConfig: { thinkingBudget: 0 } }
  }
  if (model.providerID === "openrouter") {
    if (model.api.id.includes("google")) {
      return { reasoning: { enabled: false } }
    }
    return { reasoningEffort: "minimal" }
  }
  return {}
}
