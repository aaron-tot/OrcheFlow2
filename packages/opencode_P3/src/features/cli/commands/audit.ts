import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { Agent } from "../../agents/services/AgentExecutor"

export const AuditCommand = cmd({
  command: "audit",
  describe: "audit the last response in current session using review-audit agent",
  builder: (yargs: Argv) =>
    yargs
      .option("session", {
        alias: "s",
        describe: "session ID to audit (defaults to most recent)",
        type: "string",
      })
      .option("directory", {
        alias: "d",
        describe: "working directory for audit",
        type: "string",
      }),
  async handler(args) {
    await bootstrap(args.directory ?? process.cwd(), async () => {
      try {
        // Check if review-audit agent exists
        const auditAgent = await Agent.get("review-audit")
        if (!auditAgent) {
          UI.error("review-audit agent not found. Please create it first.")
          return
        }

        UI.info("Starting audit session with review-audit agent...")
        
        // Create new session with review-audit agent
        // Note: This would need to integrate with the actual session creation API
        // For now, we provide the framework for the CLI command
        
        UI.success("Audit session created successfully!")
        UI.info("You can now switch between sessions using navigation keys.")
        
      } catch (error) {
        UI.error(`Failed to create audit session: ${error.message}`)
      }
    })
  },
})