import { spawn } from "child_process"
import { execSync } from "child_process"
import { readFileSync } from "fs"
import path from "path"

const config = JSON.parse(readFileSync("./config.json", "utf8"))
const FRONTEND_PORT = config.ports.frontend
const BACKEND_PORT = config.ports.backend

function killPort(port) {
  try {
    console.log(`Checking port ${port}...`)
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" })
    const lines = result.split("\n").filter((line) => line.includes("LISTENING"))

    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && pid !== "0") {
        console.log(`Killing process ${pid} on port ${port}`)
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" })
        } catch (e) {
          // Process might already be dead
        }
      }
    }
  } catch (e) {
    // No process on this port
    console.log(`Port ${port} is free`)
  }
}

console.log("Cleaning up ports...")
killPort(FRONTEND_PORT)
killPort(BACKEND_PORT)

console.log("\nStarting backend on port", BACKEND_PORT)
const backend = spawn("bun", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  cwd: path.join(process.cwd(), "packages/backend"),
  env: {
    ...process.env,
    PORT: BACKEND_PORT.toString(),
    HOST: "127.0.0.1",
    OPENCODE_DIRECTORY: process.cwd(),
  },
})

let frontend = null
let isShuttingDown = false

setTimeout(() => {
  console.log("\nStarting frontend on port", FRONTEND_PORT)
  frontend = spawn("bun", ["run", "dev"], {
    stdio: "inherit",
    shell: true,
    cwd: path.join(process.cwd(), "packages/solidJS"),
    env: {
      ...process.env,
      VITE_OPENCODE_SERVER_HOST: "localhost",
      VITE_OPENCODE_SERVER_PORT: BACKEND_PORT.toString(),
      VITE_OPENCODE_FRONTEND_PORT: FRONTEND_PORT.toString(),
    },
  })

  frontend.on("exit", (code) => {
    if (!isShuttingDown) {
      console.log(`Frontend exited with code ${code}`)
      gracefulShutdown(code)
    }
  })
}, 2000)

backend.on("exit", (code) => {
  if (!isShuttingDown) {
    console.log(`Backend exited with code ${code}`)
    gracefulShutdown(code)
  }
})

function gracefulShutdown(exitCode = 0) {
  if (isShuttingDown) return
  isShuttingDown = true
  
  console.log("\n🛑 Shutting down gracefully...")
  
  if (frontend) {
    console.log("Stopping frontend...")
    frontend.kill("SIGTERM")
  }
  
  if (backend) {
    console.log("Stopping backend...")
    backend.kill("SIGTERM")
  }
  
  setTimeout(() => {
    console.log("✅ Shutdown complete")
    process.exit(exitCode)
  }, 1000)
}

process.on("SIGINT", () => {
  console.log("\n\n⚠️  Received Ctrl+C")
  gracefulShutdown(0)
})

process.on("SIGTERM", () => {
  console.log("\n\n⚠️  Received SIGTERM")
  gracefulShutdown(0)
})
