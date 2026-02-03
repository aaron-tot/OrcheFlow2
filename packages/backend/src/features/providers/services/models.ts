import { Global } from "../../../shared/utils/global"
import { Log } from "../../../shared/utils/log"
import path from "path"
import z from "zod"
import { data } from "./models-macro" with { type: "macro" }
import { Installation } from "../../../infrastructure/installation"
import { Flag } from "../../../shared/config/flags/flag"

export namespace ModelsDev {
  const log = Log.create({ service: "models.dev" })
  const filepath = path.join(Global.Path.cache, "models.json")
  
  // Cache for get() results
  let cachedProviders: Record<string, Provider> | null = null

  export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
      .union([
        z.literal(true),
        z
          .object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          })
          .strict(),
      ])
      .optional(),
    cost: z
      .object({
        input: z.number(),
        output: z.number(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
        context_over_200k: z
          .object({
            input: z.number(),
            output: z.number(),
            cache_read: z.number().optional(),
            cache_write: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    modalities: z
      .object({
        input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      })
      .optional(),
    experimental: z.boolean().optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    options: z.record(z.string(), z.any()),
    headers: z.record(z.string(), z.string()).optional(),
    provider: z.object({ npm: z.string() }).optional(),
    variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  })
  export type Model = z.infer<typeof Model>

  export const Provider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), Model),
  })

  export type Provider = z.infer<typeof Provider>

  /**
   * Invalidate the cache so next get() call re-reads from disk
   */
  export async function invalidate() {
    cachedProviders = null
    log.info('Cache invalidated - next get() will reload from disk')
  }

  export async function get() {
    // Return cached result if available
    if (cachedProviders) {
      return cachedProviders
    }
    
    refresh()
    const file = Bun.file(filepath)
    const result = await file.json().catch(() => {})
    let providers: Record<string, Provider>
    
    if (result) {
      providers = result as Record<string, Provider>
    } else if (typeof data === "function") {
      const json = await data()
      providers = JSON.parse(json) as Record<string, Provider>
    } else {
      const json = await fetch("https:/models.dev/api.json").then((x) => x.text())
      providers = JSON.parse(json) as Record<string, Provider>
    }

    // Add local ollama provider if available (development only)
    if (process.env.NODE_ENV !== "production") {
      try {
        // Try multiple possible locations for models-local-api.json
        const possiblePaths = [
          path.join(import.meta.dirname, "models-local-api.json"),
          path.join(process.cwd(), "models-local-api.json"),
          path.join(process.cwd(), "..", "..", "models-local-api.json"),
        ]
        
        for (const localOllamaPath of possiblePaths) {
          const localOllamaFile = Bun.file(localOllamaPath)
          if (await localOllamaFile.exists()) {
            const localOllama = await localOllamaFile.json()
            if (localOllama && localOllama["ollama-local"]) {
              providers = { ...providers, ...localOllama }
              log.info("Added local ollama provider from:", localOllamaPath)
              break
            }
          }
        }
      } catch (e) {
        // Ignore errors in production
      }
    }

    // Cache the result AFTER adding local providers
    cachedProviders = providers

    return providers
  }

  export async function refresh() {
    if (Flag.OPENCODE_DISABLE_MODELS_FETCH) return
    const file = Bun.file(filepath)
    log.info("refreshing", {
      file,
    })
    const result = await fetch("https:/models.dev/api.json", {
      headers: {
        "User-Agent": Installation.USER_AGENT,
      },
      signal: AbortSignal.timeout(10 * 1000),
    }).catch((e) => {
      log.error("Failed to fetch models.dev", {
        error: e,
      })
    })
    if (result && result.ok) await Bun.write(file, await result.text())
  }
}

setInterval(() => ModelsDev.refresh(), 60 * 1000 * 60).unref()


