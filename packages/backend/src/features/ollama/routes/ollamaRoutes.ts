import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { exec } from "child_process"
import { promisify } from "util"
import { Log } from "../../../shared/utils/log"

const execAsync = promisify(exec)
const log = Log.create({ service: "ollama" })

export function OllamaRoutes() {
  const app = new Hono()

  // Check Ollama status
  app.get(
    "/status",
    describeRoute({
      summary: "Check Ollama status",
      description: "Check if Ollama server is running",
      operationId: "ollama.status",
      responses: {
        200: {
          description: "Ollama status",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  running: z.boolean(),
                  port: z.number().optional(),
                  pid: z.number().optional(),
                })
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        // Check if port 11434 is listening
        const { stdout } = await execAsync('netstat -ano | findstr ":11434"')
        
        if (stdout.includes("LISTENING")) {
          // Extract PID from netstat output
          const lines = stdout.split("\n")
          const listeningLine = lines.find(line => line.includes("LISTENING"))
          const pidMatch = listeningLine?.match(/\s+(\d+)\s*$/)
          const pid = pidMatch ? parseInt(pidMatch[1]) : undefined
          
          return c.json({
            running: true,
            port: 11434,
            pid,
          })
        }
        
        return c.json({ running: false })
      } catch (error) {
        // netstat returns error if no match found
        return c.json({ running: false })
      }
    }
  )

  // Start Ollama server
  app.post(
    "/start",
    describeRoute({
      summary: "Start Ollama server",
      description: "Start the Ollama server process",
      operationId: "ollama.start",
      responses: {
        200: {
          description: "Ollama started successfully",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  message: z.string(),
                  pid: z.number().optional(),
                })
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        // Check if already running
        try {
          const { stdout } = await execAsync('netstat -ano | findstr ":11434"')
          if (stdout.includes("LISTENING")) {
            return c.json({
              success: false,
              message: "Ollama is already running",
            })
          }
        } catch {}

        // Start Ollama server in background
        log.info("Starting Ollama server...")
        
        // Use start command to run in separate window
        const startCommand = process.platform === "win32" 
          ? 'start /B ollama serve'
          : 'ollama serve > /dev/null 2>&1 &'
        
        await execAsync(startCommand)
        
        // Wait a bit for the server to start
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Verify it started
        const { stdout } = await execAsync('netstat -ano | findstr ":11434"')
        if (stdout.includes("LISTENING")) {
          const lines = stdout.split("\n")
          const listeningLine = lines.find(line => line.includes("LISTENING"))
          const pidMatch = listeningLine?.match(/\s+(\d+)\s*$/)
          const pid = pidMatch ? parseInt(pidMatch[1]) : undefined
          
          log.info("Ollama server started", { pid })
          return c.json({
            success: true,
            message: "Ollama server started successfully",
            pid,
          })
        }
        
        return c.json({
          success: false,
          message: "Failed to start Ollama server",
        })
      } catch (error) {
        log.error("Failed to start Ollama", { error })
        return c.json({
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }
  )

  // Stop Ollama server
  app.post(
    "/stop",
    describeRoute({
      summary: "Stop Ollama server",
      description: "Stop the running Ollama server process",
      operationId: "ollama.stop",
      responses: {
        200: {
          description: "Ollama stopped successfully",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  message: z.string(),
                })
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        // Find the PID
        const { stdout } = await execAsync('netstat -ano | findstr ":11434"')
        
        if (!stdout.includes("LISTENING")) {
          return c.json({
            success: false,
            message: "Ollama is not running",
          })
        }
        
        const lines = stdout.split("\n")
        const listeningLine = lines.find(line => line.includes("LISTENING"))
        const pidMatch = listeningLine?.match(/\s+(\d+)\s*$/)
        
        if (!pidMatch) {
          return c.json({
            success: false,
            message: "Could not find Ollama process ID",
          })
        }
        
        const pid = parseInt(pidMatch[1])
        
        // Kill the process
        log.info("Stopping Ollama server", { pid })
        const killCommand = process.platform === "win32"
          ? `taskkill /F /PID ${pid}`
          : `kill ${pid}`
        
        await execAsync(killCommand)
        
        log.info("Ollama server stopped")
        return c.json({
          success: true,
          message: "Ollama server stopped successfully",
        })
      } catch (error) {
        log.error("Failed to stop Ollama", { error })
        return c.json({
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }
  )

  return app
}
