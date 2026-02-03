/**
 * File: agent-core.ts
 * Purpose: Core agent class initialization and constructor
 */

import type {
  Agent as ACPAgent,
  AgentSideConnection,
  AuthenticateRequest,
  AuthMethod,
  InitializeRequest,
  InitializeResponse,
  PermissionOption,
} from "@agentclientprotocol/sdk"
import { Log } from "../../../shared/utils/log"
import { ACPSessionManager } from "./session"
import type { ACPConfig } from "./types"
import { Installation } from "../../../infrastructure/installation"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"

export namespace ACPCore {
  const log = Log.create({ service: "acp-agent" })

  export async function init({ sdk: _sdk }: { sdk: OpencodeClient }) {
    return {
      create: (connection: AgentSideConnection, fullConfig: ACPConfig) => {
        return new Agent(connection, fullConfig)
      },
    }
  }

  export class Agent implements ACPAgent {
    private connection: AgentSideConnection
    private config: ACPConfig
    private sdk: OpencodeClient
    private sessionManager: ACPSessionManager
    private eventAbort = new AbortController()
    private eventStarted = false
    private permissionQueues = new Map<string, Promise<void>>()
    private permissionOptions: PermissionOption[] = [
      { optionId: "once", kind: "allow_once", name: "Allow once" },
      { optionId: "always", kind: "allow_always", name: "Always allow" },
      { optionId: "reject", kind: "reject_once", name: "Reject" },
    ]

    constructor(connection: AgentSideConnection, config: ACPConfig) {
      this.connection = connection
      this.config = config
      this.sdk = config.sdk
      this.sessionManager = new ACPSessionManager(this.sdk)
      this.startEventSubscription()
    }

    // Getters for protected access
    getConnection() {
      return this.connection
    }

    getConfig() {
      return this.config
    }

    getSdk() {
      return this.sdk
    }

    getSessionManager() {
      return this.sessionManager
    }

    getEventAbort() {
      return this.eventAbort
    }

    getPermissionQueues() {
      return this.permissionQueues
    }

    getPermissionOptions() {
      return this.permissionOptions
    }

    private startEventSubscription() {
      if (this.eventStarted) return
      this.eventStarted = true
      this.runEventSubscription().catch((error) => {
        if (this.eventAbort.signal.aborted) return
        log.error("event subscription failed", { error })
      })
    }

    private async runEventSubscription() {
      while (true) {
        if (this.eventAbort.signal.aborted) return
        const events = await this.sdk.global.event({
          signal: this.eventAbort.signal,
        })
        for await (const event of events.stream) {
          if (this.eventAbort.signal.aborted) return
          const payload = (event as any)?.payload
          if (!payload) continue
          // Import handleEvent from agent-state
          const { handleEvent } = await import("./agent-state")
          await handleEvent
            .call(this, payload)
            .catch((error: Error) => {
              log.error("failed to handle event", { error, type: payload.type })
            })
        }
      }
    }

    async initialize(params: InitializeRequest): Promise<InitializeResponse> {
      log.info("initialize", { protocolVersion: params.protocolVersion })

      const authMethod: AuthMethod = {
        description: "Run `opencode auth login` in the terminal",
        name: "Login with opencode",
        id: "opencode-login",
      }

      // If client supports terminal-auth capability, use that instead.
      if (params.clientCapabilities?._meta?.["terminal-auth"] === true) {
        authMethod._meta = {
          "terminal-auth": {
            command: "opencode",
            args: ["auth", "login"],
            label: "OpenCode Login",
          },
        }
      }

      return {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          mcpCapabilities: {
            http: true,
            sse: true,
          },
          promptCapabilities: {
            embeddedContext: true,
            image: true,
          },
        },
        authMethods: [authMethod],
        agentInfo: {
          name: "OpenCode",
          version: Installation.VERSION,
        },
      }
    }

    async authenticate(_params: AuthenticateRequest) {
      throw new Error("Authentication not implemented")
    }

    // Re-export methods that will be implemented in other files
    async newSession(params: any): Promise<any> {
      const { newSession } = await import("./agent-state")
      return newSession.call(this, params)
    }

    async loadSession(params: any): Promise<any> {
      const { loadSession } = await import("./agent-state")
      return loadSession.call(this, params)
    }

    async setSessionModel(params: any): Promise<any> {
      const { setSessionModel } = await import("./agent-state")
      return setSessionModel.call(this, params)
    }

    async setSessionMode(params: any): Promise<any> {
      const { setSessionMode } = await import("./agent-state")
      return setSessionMode.call(this, params)
    }

    async prompt(params: any): Promise<any> {
      const { prompt } = await import("./agent-actions")
      return prompt.call(this, params)
    }

    async cancel(params: any): Promise<any> {
      const { cancel } = await import("./agent-actions")
      return cancel.call(this, params)
    }
  }
}
