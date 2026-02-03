/**
 * Middleware - HTTP middleware stack configuration
 * Purpose: Configures all HTTP middleware (CORS, auth, logging, etc.)
 */
import { cors } from "hono/cors"
import { basicAuth } from "hono/basic-auth"
import { Flag } from "../shared/config/flags/flag"
import { Log } from "../shared/utils/log"
import { Instance } from "../core/instance"
import { InstanceBootstrap } from "../features/projects/services/bootstrap"
import type { Context, Next } from "hono"

export namespace Middleware {
  const log = Log.create({ service: "middleware" })
  let _corsWhitelist: string[] = []

  export function setCorsWhitelist(whitelist: string[]) {
    _corsWhitelist = whitelist
  }

  export function corsMiddleware() {
    return cors({
      origin(input) {
        if (!input) return

        if (input.startsWith("http://localhost:")) return input
        if (input.startsWith("http://127.0.0.1:")) return input
        if (input === "tauri://localhost" || input === "http://tauri.localhost") return input

        // *.opencode.ai (https only, adjust if needed)
        if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(input)) {
          return input
        }
        if (_corsWhitelist.includes(input)) {
          return input
        }

        return
      },
    })
  }

  export function basicAuthMiddleware() {
    return (c: Context, next: Next) => {
      const password = Flag.OPENCODE_SERVER_PASSWORD
      if (!password) return next()
      const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
      return basicAuth({ username, password })(c, next)
    }
  }

  export function loggingMiddleware() {
    return async (c: Context, next: Next) => {
      // Disabled verbose logging - only log errors
      await next()
    }
  }

  export function instanceMiddleware() {
    return async (c: Context, next: Next) => {
      let directory = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
      try {
        directory = decodeURIComponent(directory)
      } catch {
        // fallback to original value
      }
      return Instance.provide({
        directory,
        init: InstanceBootstrap,
        async fn() {
          return next()
        },
      })
    }
  }
}
