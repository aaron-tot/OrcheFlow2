import { defineConfig } from "vite"
import appPlugin from "@opencode-ai/app/vite"
import { readFileSync } from "fs"
import { resolve } from "path"

// Read config.json from root
const configPath = resolve(__dirname, "../../config.json")
const config = JSON.parse(readFileSync(configPath, "utf8"))
const FRONTEND_PORT = config.ports?.frontend || 4000

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [appPlugin],
  publicDir: "../app/public",
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  esbuild: {
    // Improves production stack traces
    keepNames: true,
  },
  // build: {
  // sourcemap: true,
  // },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: FRONTEND_PORT,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: FRONTEND_PORT + 1,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
})
