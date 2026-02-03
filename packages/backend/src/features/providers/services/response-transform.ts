/**
 * Response Transformation Logic
 * Purpose: Transforms API response schemas and handles errors
 */
import type { APICallError } from "ai"
import type { JSONSchema } from "zod/v4/core"
import type { Provider } from "./provider"

export function transformSchema(model: Provider.Model, schema: JSONSchema.BaseSchema) {
  /*
  if (["openai", "azure"].includes(providerID)) {
    if (schema.type === "object" && schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        if (schema.required?.includes(key)) continue
        schema.properties[key] = {
          anyOf: [
            value as JSONSchema.JSONSchema,
            {
              type: "null",
            },
          ],
        }
      }
    }
  }
  */

  // Convert integer enums to string enums for Google/Gemini
  if (model.providerID === "google" || model.api.id.includes("gemini")) {
    const sanitizeGemini = (obj: any): any => {
      if (obj === null || typeof obj !== "object") {
        return obj
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitizeGemini)
      }

      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        if (key === "enum" && Array.isArray(value)) {
          // Convert all enum values to strings
          result[key] = value.map((v) => String(v))
          // If we have integer type with enum, change type to string
          if (result.type === "integer" || result.type === "number") {
            result.type = "string"
          }
        } else if (typeof value === "object" && value !== null) {
          result[key] = sanitizeGemini(value)
        } else {
          result[key] = value
        }
      }

      // Filter required array to only include fields that exist in properties
      if (result.type === "object" && result.properties && Array.isArray(result.required)) {
        result.required = result.required.filter((field: any) => field in result.properties)
      }

      if (result.type === "array" && result.items == null) {
        result.items = {}
      }

      return result
    }

    schema = sanitizeGemini(schema)
  }

  return schema
}

export function transformError(providerID: string, error: APICallError) {
  let message = error.message
  if (providerID.includes("github-copilot") && error.statusCode === 403) {
    return "Please reauthenticate with the copilot provider to ensure your credentials work properly with OpenCode."
  }
  if (providerID.includes("github-copilot") && message.includes("The requested model is not supported")) {
    return (
      message +
      "\n\nMake sure the model is enabled in your copilot settings: https:/github.com/settings/copilot/features"
    )
  }

  return message
}
