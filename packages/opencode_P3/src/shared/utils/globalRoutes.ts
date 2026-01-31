import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { BusEvent } from "../../core/bus/bus-event"
import { GlobalBus } from "../../core/bus/global"
import { Instance } from "../../core/instance"
import { Installation } from "../../features/cli/infrastructure/installation"
import { Log } from "../../shared/utils/log"
import { lazy } from "../../shared/utils/lazy"
import si from "systeminformation"

const log = Log.create({ service: "server" })

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

export const GlobalRoutes = lazy(() =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Get health",
        description: "Get health information about the OpenCode server.",
        operationId: "global.health",
        responses: {
          200: {
            description: "Health information",
            content: {
              "application/json": {
                schema: resolver(z.object({ healthy: z.literal(true), version: z.string() })),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json({ healthy: true, version: Installation.VERSION })
      },
    )
    .get(
      "/system-stats",
      describeRoute({
        summary: "Get system statistics",
        description: "Get current system statistics including CPU, RAM, GPU, temperature, and fan speed.",
        operationId: "global.systemStats",
        responses: {
          200: {
            description: "System statistics",
            content: {
              "application/json": {
                schema: resolver(z.object({
                  cpu: z.object({
                    usage: z.number(),
                    temperature: z.number().optional(),
                    cores: z.number(),
                    model: z.string(),
                  }),
                  memory: z.object({
                    used: z.number(),
                    total: z.number(),
                    percentage: z.number(),
                  }),
                  gpu: z.array(z.object({
                    name: z.string(),
                    usage: z.number().optional(),
                    memoryUsed: z.number().optional(),
                    memoryTotal: z.number().optional(),
                    temperature: z.number().optional(),
                  })).optional(),
                  fans: z.array(z.object({
                    label: z.string(),
                    speed: z.number(),
                  })).optional(),
                })),
              },
            },
          },
        },
      }),
      async (c) => {
        try {
          // For now, return mock data to test the frontend
          const stats = {
            cpu: {
              usage: 25,
              temperature: 45,
              cores: 8,
              model: 'Intel Core i7-10700K',
            },
            memory: {
              used: 8192,
              total: 16384,
              percentage: 50,
            },
            gpu: [{
              name: 'NVIDIA GeForce RTX 3070',
              usage: 30,
              memoryUsed: 2048,
              memoryTotal: 8192,
              temperature: 55,
            }],
            fans: [{
              label: 'CPU Fan',
              speed: 1200,
            }, {
              label: 'Case Fan',
              speed: 800,
            }],
          }

          return c.json(stats)
        } catch (error) {
          console.error('Failed to get system stats:', error)
          return c.json({
            cpu: { usage: 0, cores: 0, model: 'Unknown' },
            memory: { used: 0, total: 0, percentage: 0 },
          })
        }
      },
    )
    .get(
      "/event",
      describeRoute({
        summary: "Get global events",
        description: "Subscribe to global events from the OpenCode system using server-sent events.",
        operationId: "global.event",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      directory: z.string(),
                      payload: BusEvent.payloads(),
                    })
                    .meta({
                      ref: "GlobalEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global event connected")
        return streamSSE(c, async (stream) => {
          stream.writeSSE({
            data: JSON.stringify({
              payload: {
                type: "server.connected",
                properties: {},
              },
            }),
          })
          async function handler(event: any) {
            await stream.writeSSE({
              data: JSON.stringify(event),
            })
          }
          GlobalBus.on("event", handler)

          // Send heartbeat every 30s to prevent WKWebView timeout (60s default)
          const heartbeat = setInterval(() => {
            stream.writeSSE({
              data: JSON.stringify({
                payload: {
                  type: "server.heartbeat",
                  properties: {},
                },
              }),
            })
          }, 30000)

          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              clearInterval(heartbeat)
              GlobalBus.off("event", handler)
              resolve()
              log.info("global event disconnected")
            })
          })
        })
      },
    )
    .post(
      "/dispose",
      describeRoute({
        summary: "Dispose instance",
        description: "Clean up and dispose all OpenCode instances, releasing all resources.",
        operationId: "global.dispose",
        responses: {
          200: {
            description: "Global disposed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Instance.disposeAll()
        GlobalBus.emit("event", {
          directory: "global",
          payload: {
            type: GlobalDisposedEvent.type,
            properties: {},
          },
        })
        return c.json(true)
      },
    )
    .get(
      "/debug-info",
      describeRoute({
        summary: "Get debug information",
        description: "Get debug information including mode and data directories.",
        operationId: "global.debugInfo",
        responses: {
          200: {
            description: "Debug information",
            content: {
              "application/json": {
                schema: resolver(z.object({
                  mode: z.string(),
                  appName: z.string(),
                  dataDirectory: z.string(),
                  cacheDirectory: z.string(),
                  configDirectory: z.string(),
                  stateDirectory: z.string(),
                })),
              },
            },
          },
        },
      }),
      async (c) => {
        const { Global } = await import("../../global")
        const suffix = process.env.OPENCODE_APP_SUFFIX || "_prod"
        const mode = suffix === "_dev" ? "DEV" : "PRODUCTION"
        const appName = `opencode${suffix}`
        return c.json({
          mode,
          appName,
          dataDirectory: Global.Path.data,
          cacheDirectory: Global.Path.cache,
          configDirectory: Global.Path.config,
          stateDirectory: Global.Path.state,
        })
      },
    )
)
