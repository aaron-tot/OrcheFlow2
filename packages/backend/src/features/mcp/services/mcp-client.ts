/**
 * MCP Client Connection Logic
 * Handles client creation, connection, and transport management
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js"
import { Config } from "../../../shared/config/config"
import { Log } from "../../../shared/utils/log"
import { withTimeout } from "../../../shared/utils/timeout"
import { McpOAuthProvider } from "./oauth-provider"
import { Bus } from "../../../core/bus"
import { Instance } from "../../../core/instance"
// import { TuiEvent } from "../../cli/commands/tui/event" // CLI-only, not in backend
import z from "zod/v4"

const log = Log.create({ service: "mcp-client" })
const DEFAULT_TIMEOUT = 30_000

export type MCPClient = Client

// Store transports for OAuth servers to allow finishing auth
export type TransportWithAuth = StreamableHTTPClientTransport | SSEClientTransport
export const pendingOAuthTransports = new Map<string, TransportWithAuth>()

export const Status = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("connected"),
      })
      .meta({
        ref: "MCPStatusConnected",
      }),
    z
      .object({
        status: z.literal("disabled"),
      })
      .meta({
        ref: "MCPStatusDisabled",
      }),
    z
      .object({
        status: z.literal("failed"),
        error: z.string(),
      })
      .meta({
        ref: "MCPStatusFailed",
      }),
    z
      .object({
        status: z.literal("needs_auth"),
      })
      .meta({
        ref: "MCPStatusNeedsAuth",
      }),
    z
      .object({
        status: z.literal("needs_client_registration"),
        error: z.string(),
      })
      .meta({
        ref: "MCPStatusNeedsClientRegistration",
      }),
  ])
  .meta({
    ref: "MCPStatus",
  })
export type Status = z.infer<typeof Status>

// Register notification handlers for MCP client
export function registerNotificationHandlers(client: MCPClient, serverName: string) {
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    log.info("tools list changed notification received", { server: serverName })
    // Bus.publish(ToolsChanged, { server: serverName })
  })
}

type McpEntry = NonNullable<Config.Info["mcp"]>[string]

export function isMcpConfigured(entry: McpEntry): entry is Config.Mcp {
  return typeof entry === "object" && entry !== null && "type" in entry
}

export interface CreateClientResult {
  mcpClient: MCPClient | undefined
  status: Status
}

/**
 * Create and connect an MCP client based on configuration
 */
export async function createClient(key: string, mcp: Config.Mcp): Promise<CreateClientResult> {
  if (mcp.enabled === false) {
    log.info("mcp server disabled", { key })
    return {
      mcpClient: undefined,
      status: { status: "disabled" as const },
    }
  }

  log.info("found", { key, type: mcp.type })
  let mcpClient: MCPClient | undefined
  let status: Status | undefined = undefined

  if (mcp.type === "remote") {
    const result = await connectRemoteClient(key, mcp)
    mcpClient = result.mcpClient
    status = result.status
  }

  if (mcp.type === "local") {
    const result = await connectLocalClient(key, mcp)
    mcpClient = result.mcpClient
    status = result.status
  }

  if (!status) {
    status = {
      status: "failed" as const,
      error: "Unknown error",
    }
  }

  if (!mcpClient) {
    return {
      mcpClient: undefined,
      status,
    }
  }

  const result = await withTimeout(mcpClient.listTools(), mcp.timeout ?? DEFAULT_TIMEOUT).catch((err) => {
    log.error("failed to get tools from client", { key, error: err })
    return undefined
  })
  if (!result) {
    await mcpClient.close().catch((error) => {
      log.error("Failed to close MCP client", {
        error,
      })
    })
    status = {
      status: "failed",
      error: "Failed to get tools",
    }
    return {
      mcpClient: undefined,
      status: {
        status: "failed" as const,
        error: "Failed to get tools",
      },
    }
  }

  log.info("createClient() successfully created client", { key, toolCount: result.tools.length })
  return {
    mcpClient,
    status,
  }
}

/**
 * Connect to a remote MCP server (HTTP/SSE)
 */
async function connectRemoteClient(key: string, mcp: Config.Mcp & { type: "remote" }): Promise<CreateClientResult> {
  // OAuth is enabled by default for remote servers unless explicitly disabled with oauth: false
  const oauthDisabled = mcp.oauth === false
  const oauthConfig = typeof mcp.oauth === "object" ? mcp.oauth : undefined
  let authProvider: McpOAuthProvider | undefined

  if (!oauthDisabled) {
    authProvider = new McpOAuthProvider(
      key,
      mcp.url,
      {
        clientId: oauthConfig?.clientId,
        clientSecret: oauthConfig?.clientSecret,
        scope: oauthConfig?.scope,
      },
      {
        onRedirect: async (url) => {
          log.info("oauth redirect requested", { key, url: url.toString() })
          // Store the URL - actual browser opening is handled by startAuth
        },
      },
    )
  }

  const transports: Array<{ name: string; transport: TransportWithAuth }> = [
    {
      name: "StreamableHTTP",
      transport: new StreamableHTTPClientTransport(new URL(mcp.url), {
        authProvider,
        requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
      }),
    },
    {
      name: "SSE",
      transport: new SSEClientTransport(new URL(mcp.url), {
        authProvider,
        requestInit: mcp.headers ? { headers: mcp.headers } : undefined,
      }),
    },
  ]

  let lastError: Error | undefined
  const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
  let mcpClient: MCPClient | undefined
  let status: Status | undefined

  for (const { name, transport } of transports) {
    try {
      const client = new Client({
        name: "opencode",
        version: "0.0.0", // Installation.VERSION
      })
      await withTimeout(client.connect(transport), connectTimeout)
      registerNotificationHandlers(client, key)
      mcpClient = client
      log.info("connected", { key, transport: name })
      status = { status: "connected" }
      break
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Handle OAuth-specific errors
      if (error instanceof UnauthorizedError) {
        log.info("mcp server requires authentication", { key, transport: name })

        // Check if this is a "needs registration" error
        if (lastError.message.includes("registration") || lastError.message.includes("client_id")) {
          status = {
            status: "needs_client_registration" as const,
            error: "Server does not support dynamic client registration. Please provide clientId in config.",
          }
          // Show toast for needs_client_registration
          // Bus.publish(TuiEvent.ToastShow, {
          //   title: "MCP Authentication Required",
          //   message: `Server "${key}" requires a pre-registered client ID. Add clientId to your config.`,
          //   variant: "warning",
          //   duration: 8000,
          // }).catch((e) => log.debug("failed to show toast", { error: e }))
        } else {
          // Store transport for later finishAuth call
          pendingOAuthTransports.set(key, transport)
          status = { status: "needs_auth" as const }
          // Show toast for needs_auth
          // Bus.publish(TuiEvent.ToastShow, {
          //   title: "MCP Authentication Required",
          //   message: `Server "${key}" requires authentication. Run: opencode mcp auth ${key}`,
          //   variant: "warning",
          //   duration: 8000,
          // }).catch((e) => log.debug("failed to show toast", { error: e }))
        }
        break
      }

      log.debug("transport connection failed", {
        key,
        transport: name,
        url: mcp.url,
        error: lastError.message,
      })
      status = {
        status: "failed" as const,
        error: lastError.message,
      }
    }
  }

  if (!status) {
    status = {
      status: "failed" as const,
      error: lastError?.message ?? "Unknown error",
    }
  }

  return {
    mcpClient,
    status,
  }
}

/**
 * Connect to a local MCP server (stdio)
 */
async function connectLocalClient(key: string, mcp: Config.Mcp & { type: "local" }): Promise<CreateClientResult> {
  const [cmd, ...args] = mcp.command
  const cwd = Instance.directory
  const transport = new StdioClientTransport({
    stderr: "ignore",
    command: cmd,
    args,
    cwd,
    env: {
      ...process.env,
      ...(cmd === "opencode" ? { BUN_BE_BUN: "1" } : {}),
      ...mcp.environment,
    },
  })

  const connectTimeout = mcp.timeout ?? DEFAULT_TIMEOUT
  let mcpClient: MCPClient | undefined
  let status: Status

  try {
    const client = new Client({
      name: "opencode",
      version: "0.0.0", // Installation.VERSION
    })
    await withTimeout(client.connect(transport), connectTimeout)
    registerNotificationHandlers(client, key)
    mcpClient = client
    status = {
      status: "connected",
    }
  } catch (error) {
    log.error("local mcp startup failed", {
      key,
      command: mcp.command,
      cwd,
      error: error instanceof Error ? error.message : String(error),
    })
    status = {
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  return {
    mcpClient,
    status,
  }
}
