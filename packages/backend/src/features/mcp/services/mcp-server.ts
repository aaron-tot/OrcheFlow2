/**
 * MCP Server Management
 * Handles server lifecycle, state management, and server operations
 */

import { Config } from "../../../shared/config/config"
import { Log } from "../../../shared/utils/log"
import { Instance } from "../../../core/instance"
import { createClient, isMcpConfigured, type MCPClient, type Status } from "./mcp-client"
import { BusEvent } from "../../../core/bus/bus-event"
import z from "zod/v4"

const log = Log.create({ service: "mcp-server" })

export const ToolsChanged = BusEvent.define(
  "mcp.tools.changed",
  z.object({
    server: z.string(),
  }),
)

export const BrowserOpenFailed = BusEvent.define(
  "mcp.browser.open.failed",
  z.object({
    mcpName: z.string(),
    url: z.string(),
  }),
)

interface ServerState {
  status: Record<string, Status>
  clients: Record<string, MCPClient>
}

/**
 * Initialize and manage MCP server state
 */
export const state = Instance.state(
  async (): Promise<ServerState> => {
    const cfg = await Config.get()
    const config = cfg.mcp ?? {}
    const clients: Record<string, MCPClient> = {}
    const status: Record<string, Status> = {}

    await Promise.all(
      Object.entries(config).map(async ([key, mcp]) => {
        if (!isMcpConfigured(mcp)) {
          log.error("Ignoring MCP config entry without type", { key })
          return
        }

        // If disabled by config, mark as disabled without trying to connect
        if (mcp.enabled === false) {
          status[key] = { status: "disabled" }
          return
        }

        const result = await createClient(key, mcp).catch(() => undefined)
        if (!result) return

        status[key] = result.status

        if (result.mcpClient) {
          clients[key] = result.mcpClient
        }
      }),
    )
    return {
      status,
      clients,
    }
  },
  async (state) => {
    await Promise.all(
      Object.values(state.clients).map((client) =>
        client.close().catch((error) => {
          log.error("Failed to close MCP client", {
            error,
          })
        }),
      ),
    )
    // pendingOAuthTransports.clear() // Moved to mcp-client
  },
)

/**
 * Add or update an MCP server
 */
export async function add(name: string, mcp: Config.Mcp) {
  const s = await state()
  const result = await createClient(name, mcp)
  if (!result) {
    const status = {
      status: "failed" as const,
      error: "unknown error",
    }
    s.status[name] = status
    return {
      status,
    }
  }
  if (!result.mcpClient) {
    s.status[name] = result.status
    return {
      status: s.status,
    }
  }
  // Close existing client if present to prevent memory leaks
  const existingClient = s.clients[name]
  if (existingClient) {
    await existingClient.close().catch((error) => {
      log.error("Failed to close existing MCP client", { name, error })
    })
  }
  s.clients[name] = result.mcpClient
  s.status[name] = result.status

  return {
    status: s.status,
  }
}

/**
 * Get status of all configured MCP servers
 */
export async function status() {
  const s = await state()
  const cfg = await Config.get()
  const config = cfg.mcp ?? {}
  const result: Record<string, Status> = {}

  // Include all configured MCPs from config, not just connected ones
  for (const [key, mcp] of Object.entries(config)) {
    if (!isMcpConfigured(mcp)) continue
    result[key] = s.status[key] ?? { status: "disabled" }
  }

  return result
}

/**
 * Get all connected MCP clients
 */
export async function clients() {
  return state().then((state) => state.clients)
}

/**
 * Connect to an MCP server
 */
export async function connect(name: string) {
  const cfg = await Config.get()
  const config = cfg.mcp ?? {}
  const mcp = config[name]
  if (!mcp) {
    log.error("MCP config not found", { name })
    return
  }

  if (!isMcpConfigured(mcp)) {
    log.error("Ignoring MCP connect request for config without type", { name })
    return
  }

  const result = await createClient(name, { ...mcp, enabled: true })

  if (!result) {
    const s = await state()
    s.status[name] = {
      status: "failed",
      error: "Unknown error during connection",
    }
    return
  }

  const s = await state()
  s.status[name] = result.status
  if (result.mcpClient) {
    // Close existing client if present to prevent memory leaks
    const existingClient = s.clients[name]
    if (existingClient) {
      await existingClient.close().catch((error) => {
        log.error("Failed to close existing MCP client", { name, error })
      })
    }
    s.clients[name] = result.mcpClient
  }
}

/**
 * Disconnect from an MCP server
 */
export async function disconnect(name: string) {
  const s = await state()
  const client = s.clients[name]
  if (client) {
    await client.close().catch((error) => {
      log.error("Failed to close MCP client", { name, error })
    })
    delete s.clients[name]
  }
  s.status[name] = { status: "disabled" }
}

/**
 * Check if an MCP server supports OAuth
 */
export async function supportsOAuth(mcpName: string): Promise<boolean> {
  const cfg = await Config.get()
  const mcpConfig = cfg.mcp?.[mcpName]
  if (!mcpConfig) return false
  if (!isMcpConfigured(mcpConfig)) return false
  return mcpConfig.type === "remote" && mcpConfig.oauth !== false
}
