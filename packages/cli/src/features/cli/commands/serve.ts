import { Server } from "../../../app/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../services/network"
import { Flag } from "../../../shared/config/flags/flag"
import { detectEnvironment, getEnvironmentConfig } from "../../../shared/config/mainConfig"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless opencode server",
  handler: async (args) => {
    console.log('[DEBUG serve.ts] Handler called!')
    const opts = await resolveNetworkOptions(args)
    console.log('[DEBUG serve.ts] Opts resolved:', opts)
    const environment = detectEnvironment()
    const config = getEnvironmentConfig()
    const mode = environment.toUpperCase()
    
    console.log(`[OpenCode] Environment: ${environment}`)
    console.log(`[OpenCode] Mode: ${mode}`)
    console.log(`[OpenCode] Backend port: ${config.backendPort}`)
    console.log(`[OpenCode] Frontend port: ${config.frontendPort}`)
    
    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    
    console.log('[DEBUG serve.ts] About to call Server.listen...')
    const server = Server.listen(opts)
    console.log(`opencode server listening on http:/${server.hostname}:${server.port}`)
    
    console.log('[DEBUG serve.ts] Waiting forever...')
    await new Promise(() => {})
    await server.stop()
  },
})
