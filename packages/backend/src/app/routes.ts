/**
 * Routes - Main route mounting configuration
 * Purpose: Mounts all feature routes and defines global endpoints
 */
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { proxy } from "hono/proxy"
import z from "zod"
import { describeRoute, validator, resolver, openAPIRouteHandler } from "hono-openapi"
import { BusEvent } from "../core/bus/bus-event"
import { Bus } from "../core/bus"
import { Log } from "../shared/utils/log"
import { Provider } from "../features/providers/services/provider"
import { Format } from "../shared/utils/format"
import { Instance } from "../core/instance"
import { Vcs } from "../features/projects/services/vcs"
import { Agent } from "../features/agents/services/AgentExecutor"
import { Skill } from "../features/skills/services/skill"
import { Auth } from "../infrastructure/auth"
import { Global } from "../shared/utils/global"
import { ProjectRoutes } from "../features/projects/routes/projectRoutes"
import { SessionRoutes } from "../features/agents/routes/agentRoutes"
import { McpRoutes } from "../features/mcp/routes/mcpRoutes"
import { FileRoutes } from "../features/files/routes/fileRoutes"
import { ConfigRoutes } from "../shared/config/configRoutes"
import { ExperimentalRoutes } from "./experimentalRoutes"
import { ProviderRoutes } from "../features/providers/routes/providerRoutes"
import { QuestionRoutes } from "../features/questions/routes/questionRoutes"
import { PermissionRoutes } from "../features/permissions/routes/permissionRoutes"
import { GlobalRoutes } from "../shared/utils/globalRoutes"
import { OllamaRoutes } from "../features/ollama/routes/ollamaRoutes"
import { SystemRoutes } from "../features/system/routes/systemRoutes"
import { PromptRoutes } from "../features/prompts/routes/promptRoutes"
import { errors } from "./error"

export namespace Routes {
  const log = Log.create({ service: "routes" })

  export function mountRoutes(app: Hono) {
    return (
      app
        .route("/global", GlobalRoutes())
        .get(
          "/doc",
          openAPIRouteHandler(app, {
            documentation: {
              info: {
                title: "opencode",
                version: "0.0.3",
                description: "opencode api",
              },
              openapi: "3.1.1",
            },
          }),
        )
        .use(validator("query", z.object({ directory: z.string().optional() })))
        .route("/project", ProjectRoutes())
        .route("/config", ConfigRoutes())
        .route("/experimental", ExperimentalRoutes())
        .route("/session", SessionRoutes())
        .route("/permission", PermissionRoutes())
        .route("/question", QuestionRoutes())
        .route("/provider", ProviderRoutes())
        .route("/", FileRoutes())
        .route("/mcp", McpRoutes())
        .route("/ollama", OllamaRoutes())
        .route("/system", SystemRoutes())
        .route("/prompt", PromptRoutes())
        .post(
          "/instance/dispose",
          describeRoute({
            summary: "Dispose instance",
            description: "Clean up and dispose the current OpenCode instance, releasing all resources.",
            operationId: "instance.dispose",
            responses: {
              200: {
                description: "Instance disposed",
                content: {
                  "application/json": {
                    schema: resolver(z.boolean()),
                  },
                },
              },
            },
          }),
          async (c) => {
            await Instance.dispose()
            return c.json(true)
          },
        )
        .get(
          "/path",
          describeRoute({
            summary: "Get paths",
            description:
              "Retrieve the current working directory and related path information for the OpenCode instance.",
            operationId: "path.get",
            responses: {
              200: {
                description: "Path",
                content: {
                  "application/json": {
                    schema: resolver(
                      z
                        .object({
                          home: z.string(),
                          state: z.string(),
                          config: z.string(),
                          worktree: z.string(),
                          directory: z.string(),
                        })
                        .meta({
                          ref: "Path",
                        }),
                    ),
                  },
                },
              },
            },
          }),
          async (c) => {
            return c.json({
              home: Global.Path.home,
              state: Global.Path.state,
              config: Global.Path.config,
              worktree: Instance.worktree,
              directory: Instance.directory,
            })
          },
        )
        .get(
          "/vcs",
          describeRoute({
            summary: "Get VCS info",
            description:
              "Retrieve version control system (VCS) information for the current project, such as git branch.",
            operationId: "vcs.get",
            responses: {
              200: {
                description: "VCS info",
                content: {
                  "application/json": {
                    schema: resolver(Vcs.Info),
                  },
                },
              },
            },
          }),
          async (c) => {
            const branch = await Vcs.branch()
            return c.json({
              branch,
            })
          },
        )
        .get(
          "/command",
          describeRoute({
            summary: "List commands",
            description: "Get a list of all available commands in the OpenCode system.",
            operationId: "command.list",
            responses: {
              200: {
                description: "List of commands",
                content: {
                  "application/json": {
                    schema: resolver(z.array(z.any())),
                  },
                },
              },
            },
          }),
          async (c) => {
            // Return empty array for now - command service is CLI-only
            return c.json([])
          },
        )
        .post(
          "/log",
          describeRoute({
            summary: "Write log",
            description: "Write a log entry to the server logs with specified level and metadata.",
            operationId: "app.log",
            responses: {
              200: {
                description: "Log entry written successfully",
                content: {
                  "application/json": {
                    schema: resolver(z.boolean()),
                  },
                },
              },
              ...errors(400),
            },
          }),
          validator(
            "json",
            z.object({
              service: z.string().meta({ description: "Service name for the log entry" }),
              level: z.enum(["debug", "info", "error", "warn"]).meta({ description: "Log level" }),
              message: z.string().meta({ description: "Log message" }),
              extra: z
                .record(z.string(), z.any())
                .optional()
                .meta({ description: "Additional metadata for the log entry" }),
            }),
          ),
          async (c) => {
            const { service, level, message, extra } = c.req.valid("json")
            const logger = Log.create({ service })

            switch (level) {
              case "debug":
                logger.debug(message, extra)
                break
              case "info":
                logger.info(message, extra)
                break
              case "error":
                logger.error(message, extra)
                break
              case "warn":
                logger.warn(message, extra)
                break
            }

            return c.json(true)
          },
        )
        .get(
          "/agent",
          describeRoute({
            summary: "List agents",
            description: "Get a list of all available AI agents in the OpenCode system.",
            operationId: "app.agents",
            responses: {
              200: {
                description: "List of agents",
                content: {
                  "application/json": {
                    schema: resolver(Agent.Info.array()),
                  },
                },
              },
            },
          }),
          async (c) => {
            const modes = await Agent.list()
            return c.json(modes)
          },
        )
        .get(
          "/skill",
          describeRoute({
            summary: "List skills",
            description: "Get a list of all available skills in the OpenCode system.",
            operationId: "app.skills",
            responses: {
              200: {
                description: "List of skills",
                content: {
                  "application/json": {
                    schema: resolver(Skill.Info.array()),
                  },
                },
              },
            },
          }),
          async (c) => {
            const skills = await Skill.all()
            return c.json(skills)
          },
        )
        .get(
          "/formatter",
          describeRoute({
            summary: "Get formatter status",
            description: "Get formatter status",
            operationId: "formatter.status",
            responses: {
              200: {
                description: "Formatter status",
                content: {
                  "application/json": {
                    schema: resolver(Format.Status.array()),
                  },
                },
              },
            },
          }),
          async (c) => {
            return c.json(await Format.status())
          },
        )
        .put(
          "/auth/:providerID",
          describeRoute({
            summary: "Set auth credentials",
            description: "Set authentication credentials",
            operationId: "auth.set",
            responses: {
              200: {
                description: "Successfully set authentication credentials",
                content: {
                  "application/json": {
                    schema: resolver(z.boolean()),
                  },
                },
              },
              ...errors(400),
            },
          }),
          validator(
            "param",
            z.object({
              providerID: z.string(),
            }),
          ),
          validator("json", Auth.Info),
          async (c) => {
            const providerID = c.req.valid("param").providerID
            const info = c.req.valid("json")
            await Auth.set(providerID, info)
            return c.json(true)
          },
        )
        .get(
          "/auth/:providerID",
          describeRoute({
            summary: "Get auth credentials",
            description: "Get authentication credentials for a provider",
            operationId: "auth.get",
            responses: {
              200: {
                description: "Successfully retrieved authentication credentials",
                content: {
                  "application/json": {
                    schema: resolver(Auth.Info.nullable()),
                  },
                },
              },
              ...errors(400),
            },
          }),
          validator(
            "param",
            z.object({
              providerID: z.string(),
            }),
          ),
          async (c) => {
            const providerID = c.req.valid("param").providerID
            const info = await Auth.get(providerID)
            return c.json(info || null)
          },
        )
        .get(
          "/auth/:providerID/test",
          describeRoute({
            summary: "Test provider connection",
            description: "Test if a provider is reachable",
            operationId: "auth.test",
            responses: {
              200: {
                description: "Connection test result",
                content: {
                  "application/json": {
                    schema: resolver(z.object({ connected: z.boolean() })),
                  },
                },
              },
              ...errors(400),
            },
          }),
          validator(
            "param",
            z.object({
              providerID: z.string(),
            }),
          ),
          async (c) => {
            const providerID = c.req.valid("param").providerID
            log.info(`[Auth Test] Testing connection for provider: ${providerID}`)
            
            try {
              const info = await Auth.get(providerID)
              if (!info) {
                log.warn(`[Auth Test] No auth info found for provider: ${providerID}`)
                return c.json({ connected: false })
              }

              log.info(`[Auth Test] Auth info type: ${info.type}`, info)

              // For local providers, test the connection
              if (info.type === "local") {
                const baseUrl = `${info.url}:${info.port}`
                log.info(`[Auth Test] Testing local connection to: ${baseUrl}/api/tags`)
                
                // Test connection with timeout
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), 3000)
                
                try {
                  const response = await fetch(`${baseUrl}/api/tags`, {
                    signal: controller.signal,
                  })
                  clearTimeout(timeout)
                  const result = { connected: response.ok }
                  log.info(`[Auth Test] Connection ${response.ok ? 'successful' : 'failed'} - Status: ${response.status}`)
                  
                  // If connected, trigger model refresh
                  if (response.ok && providerID === "ollama-local") {
                    log.info(`[Auth Test] Triggering model refresh for ollama-local`)
                    try {
                      const { Provider } = await import("../features/providers/services/provider.js")
                      const models = await Provider.refreshOllamaModels()
                      log.info(`[Auth Test] Successfully refreshed ${Object.keys(models).length} Ollama models:`, Object.keys(models))
                    } catch (refreshErr: any) {
                      log.error(`[Auth Test] Failed to refresh models:`, refreshErr)
                    }
                  }
                  
                  return c.json(result)
                } catch (err: any) {
                  clearTimeout(timeout)
                  const isRefused = err?.code === 'ConnectionRefused' || err?.cause?.code === 'ECONNREFUSED'
                  if (isRefused) {
                    log.warn(`[Auth Test] Ollama is not running on ${baseUrl}. Start Ollama first.`)
                  } else {
                    log.error(`[Auth Test] Connection error:`, err)
                  }
                  return c.json({ connected: false })
                }
              }
              
              // For other provider types, assume connected if auth exists
              log.info(`[Auth Test] Non-local provider, assuming connected`)
              return c.json({ connected: true })
            } catch (err) {
              log.error(`[Auth Test] Error testing connection:`, err)
              return c.json({ connected: false })
            }
          },
        )
        .get(
          "/event",
          describeRoute({
            summary: "Subscribe to events",
            description: "Get events",
            operationId: "event.subscribe",
            responses: {
              200: {
                description: "Event stream",
                content: {
                  "text/event-stream": {
                    schema: resolver(BusEvent.payloads()),
                  },
                },
              },
            },
          }),
          async (c) => {
            log.info("event connected")
            return streamSSE(c, async (stream) => {
              stream.writeSSE({
                data: JSON.stringify({
                  type: "server.connected",
                  properties: {},
                }),
              })
              const unsub = Bus.subscribeAll(async (event) => {
                await stream.writeSSE({
                  data: JSON.stringify(event),
                })
                if (event.type === Bus.InstanceDisposed.type) {
                  stream.close()
                }
              })

              // Send heartbeat every 30s to prevent WKWebView timeout (60s default)
              const heartbeat = setInterval(() => {
                stream.writeSSE({
                  data: JSON.stringify({
                    type: "server.heartbeat",
                    properties: {},
                  }),
                })
              }, 30000)

              await new Promise<void>((resolve) => {
                stream.onAbort(() => {
                  clearInterval(heartbeat)
                  unsub()
                  resolve()
                  log.info("event disconnected")
                })
              })
            })
          },
        )
        .all("/*", async (c) => {
          const path = c.req.path
          const response = await proxy(`https:/app.opencode.ai${path}`, {
            ...c.req,
            headers: {
              ...c.req.raw.headers,
              host: "app.opencode.ai",
            },
          })
          response.headers.set(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'",
          )
          return response
        }) as unknown as Hono
    )
  }
}
