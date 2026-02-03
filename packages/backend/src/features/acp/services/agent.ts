/**
 * File: agent.ts
 * Purpose: Main export and orchestration - single entry point for ACP agent
 */

import type { AgentSideConnection } from "@agentclientprotocol/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import type { ACPConfig } from "./types"
import { ACPCore } from "./agent-core"

export namespace ACP {
  /**
   * Initialize the ACP agent factory
   */
  export async function init({ sdk }: { sdk: OpencodeClient }) {
    return ACPCore.init({ sdk })
  }

  /**
   * Main Agent class - delegates to implementations in other files
   */
  export class Agent extends ACPCore.Agent {
    constructor(connection: AgentSideConnection, config: ACPConfig) {
      super(connection, config)
    }
  }
}

// Re-export for convenience
export type Agent = ACP.Agent


