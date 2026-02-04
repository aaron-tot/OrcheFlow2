import type { Argv, InferredOptionTypes } from "yargs"
import { Config } from "../../../shared/config/config"
import { getEnvironmentConfig, detectEnvironment } from "../../../shared/config/mainConfig"

// Get configuration from main config system
const envConfig = getEnvironmentConfig()
const environment = detectEnvironment()

const options = {
  port: {
    type: "number" as const,
    describe: "port to listen on",
    default: envConfig.backendPort, // Use config default, not hardcoded
  },
  hostname: {
    type: "string" as const,
    describe: "hostname to listen on",
    default: "127.0.0.1",
  },
  mdns: {
    type: "boolean" as const,
    describe: "enable mDNS service discovery (defaults hostname to 0.0.0.0)",
    default: false,
  },
  cors: {
    type: "string" as const,
    array: true,
    describe: "additional domains to allow for CORS",
    default: [] as string[],
  },
}

export type NetworkOptions = InferredOptionTypes<typeof options>

export function withNetworkOptions<T>(yargs: Argv<T>) {
  return yargs.options(options)
}

export async function resolveNetworkOptions(args: NetworkOptions) {
  const portExplicitlySet = process.argv.includes("--port")
  const hostnameExplicitlySet = process.argv.includes("--hostname")
  const mdnsExplicitlySet = process.argv.includes("--mdns")
  const corsExplicitlySet = process.argv.includes("--cors")
  
  const mdns = mdnsExplicitlySet ? args.mdns : false
  const port = portExplicitlySet ? args.port : envConfig.backendPort
  const hostname = hostnameExplicitlySet
    ? args.hostname
    : "127.0.0.1"
  
  const argsCors = Array.isArray(args.cors) ? args.cors : args.cors ? [args.cors] : []
  const cors = [...argsCors]
  
  console.log(`🔧 Using backend port: ${port} (${portExplicitlySet ? 'explicit' : 'config default'})`)
  
  return { hostname, port, mdns, cors }
}
