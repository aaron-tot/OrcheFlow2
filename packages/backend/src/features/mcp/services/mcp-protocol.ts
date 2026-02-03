/**
 * MCP Protocol Handling
 * Handles protocol operations: tools, prompts, resources, and message parsing
 */

import { dynamicTool, type Tool, jsonSchema, type JSONSchema7 } from "ai"
import { type Tool as MCPToolDef } from "@modelcontextprotocol/sdk/types.js"
import { Config } from "../../../shared/config/config"
import { Log } from "../../../shared/utils/log"
import { clients, state } from "./mcp-server"
import { isMcpConfigured, type MCPClient } from "./mcp-client"
import z from "zod/v4"

const log = Log.create({ service: "mcp-protocol" })

// Prompt cache types
type PromptInfo = Awaited<ReturnType<MCPClient["listPrompts"]>>["prompts"][number]
type ResourceInfo = Awaited<ReturnType<MCPClient["listResources"]>>["resources"][number]

export const Resource = z
  .object({
    name: z.string(),
    uri: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    client: z.string(),
  })
  .meta({ ref: "McpResource" })
export type Resource = z.infer<typeof Resource>

/**
 * Convert MCP tool definition to AI SDK Tool type
 */
async function convertMcpTool(mcpTool: MCPToolDef, client: MCPClient, timeout?: number): Promise<Tool> {
  const inputSchema = mcpTool.inputSchema

  // Spread first, then override type to ensure it's always "object"
  const schema: JSONSchema7 = {
    ...(inputSchema as JSONSchema7),
    type: "object",
    properties: (inputSchema.properties ?? {}) as JSONSchema7["properties"],
    additionalProperties: false,
  }

  return dynamicTool({
    description: mcpTool.description ?? "",
    inputSchema: jsonSchema(schema),
    execute: async (args: unknown) => {
      return client.callTool(
        {
          name: mcpTool.name,
          arguments: args as Record<string, unknown>,
        },
        // CallToolResultSchema,
        undefined as any, // Placeholder - need proper import
        {
          resetTimeoutOnProgress: true,
          timeout,
        },
      )
    },
  })
}

/**
 * Helper function to fetch prompts for a specific client
 */
async function fetchPromptsForClient(clientName: string, client: MCPClient) {
  const prompts = await client.listPrompts().catch((e) => {
    log.error("failed to get prompts", { clientName, error: e.message })
    return undefined
  })

  if (!prompts) {
    return
  }

  const commands: Record<string, PromptInfo & { client: string }> = {}

  for (const prompt of prompts.prompts) {
    const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_")
    const sanitizedPromptName = prompt.name.replace(/[^a-zA-Z0-9_-]/g, "_")
    const key = sanitizedClientName + ":" + sanitizedPromptName

    commands[key] = { ...prompt, client: clientName }
  }
  return commands
}

/**
 * Helper function to fetch resources for a specific client
 */
async function fetchResourcesForClient(clientName: string, client: MCPClient) {
  const resources = await client.listResources().catch((e) => {
    log.error("failed to get resources", { clientName, error: e.message })
    return undefined
  })

  if (!resources) {
    return
  }

  const commands: Record<string, ResourceInfo & { client: string }> = {}

  for (const resource of resources.resources) {
    const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_")
    const sanitizedResourceName = resource.name.replace(/[^a-zA-Z0-9_-]/g, "_")
    const key = sanitizedClientName + ":" + sanitizedResourceName

    commands[key] = { ...resource, client: clientName }
  }
  return commands
}

/**
 * Get all available tools from connected MCP servers
 */
export async function tools() {
  const result: Record<string, Tool> = {}
  const s = await state()
  const cfg = await Config.get()
  const config = cfg.mcp ?? {}
  const clientsSnapshot = await clients()
  const defaultTimeout = cfg.experimental?.mcp_timeout

  for (const [clientName, client] of Object.entries(clientsSnapshot)) {
    // Only include tools from connected MCPs (skip disabled ones)
    if (s.status[clientName]?.status !== "connected") {
      continue
    }

    const toolsResult = await client.listTools().catch((e) => {
      log.error("failed to get tools", { clientName, error: e.message })
      const failedStatus = {
        status: "failed" as const,
        error: e instanceof Error ? e.message : String(e),
      }
      s.status[clientName] = failedStatus
      delete s.clients[clientName]
      return undefined
    })
    if (!toolsResult) {
      continue
    }
    const mcpConfig = config[clientName]
    const entry = isMcpConfigured(mcpConfig) ? mcpConfig : undefined
    const timeout = entry?.timeout ?? defaultTimeout
    for (const mcpTool of toolsResult.tools) {
      const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9_-]/g, "_")
      const sanitizedToolName = mcpTool.name.replace(/[^a-zA-Z0-9_-]/g, "_")
      result[sanitizedClientName + "_" + sanitizedToolName] = await convertMcpTool(mcpTool, client, timeout)
    }
  }
  return result
}

/**
 * Get all available prompts from connected MCP servers
 */
export async function prompts() {
  const s = await state()
  const clientsSnapshot = await clients()

  const prompts = Object.fromEntries<PromptInfo & { client: string }>(
    (
      await Promise.all(
        Object.entries(clientsSnapshot).map(async ([clientName, client]) => {
          if (s.status[clientName]?.status !== "connected") {
            return []
          }

          return Object.entries((await fetchPromptsForClient(clientName, client)) ?? {})
        }),
      )
    ).flat(),
  )

  return prompts
}

/**
 * Get all available resources from connected MCP servers
 */
export async function resources() {
  const s = await state()
  const clientsSnapshot = await clients()

  const result = Object.fromEntries<ResourceInfo & { client: string }>(
    (
      await Promise.all(
        Object.entries(clientsSnapshot).map(async ([clientName, client]) => {
          if (s.status[clientName]?.status !== "connected") {
            return []
          }

          return Object.entries((await fetchResourcesForClient(clientName, client)) ?? {})
        }),
      )
    ).flat(),
  )

  return result
}

/**
 * Get a specific prompt from an MCP server
 */
export async function getPrompt(clientName: string, name: string, args?: Record<string, string>) {
  const clientsSnapshot = await clients()
  const client = clientsSnapshot[clientName]

  if (!client) {
    log.warn("client not found for prompt", {
      clientName,
    })
    return undefined
  }

  const result = await client
    .getPrompt({
      name: name,
      arguments: args,
    })
    .catch((e) => {
      log.error("failed to get prompt from MCP server", {
        clientName,
        promptName: name,
        error: e.message,
      })
      return undefined
    })

  return result
}

/**
 * Read a resource from an MCP server
 */
export async function readResource(clientName: string, resourceUri: string) {
  const clientsSnapshot = await clients()
  const client = clientsSnapshot[clientName]

  if (!client) {
    log.warn("client not found for resource", {
      clientName: clientName,
    })
    return undefined
  }

  const result = await client
    .readResource({
      uri: resourceUri,
    })
    .catch((e) => {
      log.error("failed to read resource from MCP server", {
        clientName: clientName,
        resourceUri: resourceUri,
        error: e.message,
      })
      return undefined
    })

  return result
}
