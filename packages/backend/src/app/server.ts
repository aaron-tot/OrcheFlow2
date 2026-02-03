/**
 * Server - Main HTTP/WebSocket server setup
 * Purpose: Initializes and configures the Hono server with error handling
 */
import { Hono } from "hono"
import { websocket } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { Log } from "../shared/utils/log"
import { NamedError } from "@opencode-ai/util"
import { Provider } from "../features/providers/services/provider"
import { Storage } from "../infrastructure/storage/storage"
import { lazy } from "../shared/utils/lazy"
import { getEnvironmentConfig } from "../shared/config/mainConfig"
import { MDNS } from "./mdns"
import { Middleware } from "./middleware"
import { Routes } from "./routes"
import { generateSpecs } from "hono-openapi"
import type { ContentfulStatusCode } from "hono/utils/http-status"

// @ts-ignore This global is needed to prevent ai-sdk from logging warnings to stdout https:/github.com/vercel/ai/blob/2dc67e0ef538307f21368db32d5a12345d98831b/packages/ai/src/logger/log-warnings.ts#L85
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  let _url: URL | undefined

  export function url(): URL {
    const config = getEnvironmentConfig()
    return _url ?? new URL(`http://localhost:${config.backendPort}`)
  }

  const app = new Hono()
  export const App: () => Hono = lazy(() => {
    console.log("[DEBUG] Initializing App...")
    // TODO: Break server.ts into smaller route files to fix type inference
    app
      .onError((err, c) => {
        log.error("failed", {
          error: err,
        })
        if (err instanceof NamedError) {
          let status: ContentfulStatusCode
          if (err instanceof Storage.NotFoundError) status = 404
          else if (err instanceof Provider.ModelNotFoundError) status = 400
          else if (err.name.startsWith("Worktree")) status = 400
          else status = 500
          return c.json(err.toObject(), { status })
        }
        if (err instanceof HTTPException) return err.getResponse()
        const message = err instanceof Error && err.stack ? err.stack : err.toString()
        return c.json(new NamedError.Unknown({ message }).toObject(), {
          status: 500,
        })
      })
      .use(Middleware.corsMiddleware())
      .use(Middleware.basicAuthMiddleware())
      .use(Middleware.loggingMiddleware())
      .use(Middleware.instanceMiddleware())
    
    // Mount all routes
    console.log("[DEBUG] Mounting routes...")
    Routes.mountRoutes(app)
    console.log("[DEBUG] Routes mounted successfully")
    
    return app
  })

  export async function openapi() {
    // Cast to break excessive type recursion from long route chains
    const result = await generateSpecs(App() as Hono, {
      documentation: {
        info: {
          title: "opencode",
          version: "1.0.0",
          description: "opencode api",
        },
        openapi: "3.1.1",
      },
    })
    return result
  }

  export function listen(opts: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    Middleware.setCorsWhitelist(opts.cors ?? [])

    const args = {
      hostname: opts.hostname,
      idleTimeout: 0,
      fetch: App().fetch,
      websocket: websocket,
    } as const
    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port })
      } catch {
        return undefined
      }
    }
    const config = getEnvironmentConfig()
    const server = opts.port === 0 ? (tryServe(config.backendPort) ?? tryServe(0)) : tryServe(opts.port)
    if (!server) throw new Error(`Failed to start server on port ${opts.port}`)

    _url = server.url

    const shouldPublishMDNS =
      opts.mdns &&
      server.port &&
      opts.hostname !== "127.0.0.1" &&
      opts.hostname !== "localhost" &&
      opts.hostname !== "::1"
    if (shouldPublishMDNS) {
      MDNS.publish(server.port!)
    } else if (opts.mdns) {
      log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish")
    }

    const originalStop = server.stop.bind(server)
    server.stop = async (closeActiveConnections?: boolean) => {
      if (shouldPublishMDNS) MDNS.unpublish()
      return originalStop(closeActiveConnections)
    }

    return server
  }
}

