import { defineConfig } from "vite"
import desktopPlugin from "./vite"
import fs from "fs"
import path from "path"

// Read backend port from root config.json
const configPath = path.join(process.cwd(), "../../config.json")
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
const backendPort = config.ports.backend

export default defineConfig({
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: Number(process.env.VITE_OPENCODE_FRONTEND_PORT ?? config.ports.frontend),
    proxy: {
      "/api": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      "/system": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "esnext",
    // sourcemap: true,
  },
})
