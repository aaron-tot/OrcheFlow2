import { defineConfig } from "vite"
import desktopPlugin from "./vite"

export default defineConfig({
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: Number(process.env.VITE_OPENCODE_FRONTEND_PORT ?? "4000"),
  },
  build: {
    target: "esnext",
    // sourcemap: true,
  },
})
