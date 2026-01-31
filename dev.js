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
const backend = spawn("bun", ["run", "dev", "serve", "--port", BACKEND_PORT.toString()], {
  stdio: "inherit",
  shell: true,
  cwd: path.join(process.cwd(), "packages/opencode"),
  env: {
    ...process.env,
    OPENCODE_DIRECTORY: process.cwd(),
  },
})

setTimeout(() => {
  console.log("\nStarting frontend on port", FRONTEND_PORT)
  const frontend = spawn("bun", ["run", "--cwd", "packages/app", "dev"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      VITE_OPENCODE_SERVER_HOST: "localhost",
      VITE_OPENCODE_SERVER_PORT: BACKEND_PORT.toString(),
      VITE_OPENCODE_FRONTEND_PORT: FRONTEND_PORT.toString(),
    },
  })

  frontend.on("exit", (code) => {
    console.log(`Frontend exited with code ${code}`)
    backend.kill()
    process.exit(code)
  })
}, 2000)

backend.on("exit", (code) => {
  console.log(`Backend exited with code ${code}`)
  process.exit(code)
})

process.on("SIGINT", () => {
  console.log("\nShutting down...")
  backend.kill()
  process.exit(0)
})
