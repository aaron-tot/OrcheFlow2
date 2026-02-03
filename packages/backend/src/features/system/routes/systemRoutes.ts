import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { exec } from "child_process"
import { promisify } from "util"
import { Log } from "../../../shared/utils/log"
import os from "os"
import path from "path"
import fs from "fs"

const execAsync = promisify(exec)
const log = Log.create({ service: "system" })

// Cache file for last selected directory
const CACHE_DIR = path.join(os.homedir(), ".opencode")
const CACHE_FILE = path.join(CACHE_DIR, "last-directory.txt")

// Get last selected directory from cache
function getLastDirectory(): string | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const lastDir = fs.readFileSync(CACHE_FILE, "utf-8").trim()
      // Verify the directory still exists
      if (lastDir && fs.existsSync(lastDir)) {
        return lastDir
      }
    }
  } catch (error) {
    log.debug("Failed to read last directory cache", { error })
  }
  return null
}

// Save last selected directory to cache
function saveLastDirectory(dirPath: string): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
    fs.writeFileSync(CACHE_FILE, dirPath, "utf-8")
  } catch (error) {
    log.debug("Failed to save last directory cache", { error })
  }
}

export function SystemRoutes() {
  const app = new Hono()

  // Open native directory picker
  app.post(
    "/pick-directory",
    describeRoute({
      summary: "Open native directory picker",
      description: "Open the OS native directory picker dialog",
      operationId: "system.pickDirectory",
      responses: {
        200: {
          description: "Directory picker result",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  paths: z.array(z.string()).optional(),
                  error: z.string().optional(),
                })
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        const { multiple } = await c.req.json().catch(() => ({ multiple: false }))
        
        // Get last selected directory as default
        const lastDir = getLastDirectory()

        // Use PowerShell on Windows to show folder picker
        if (process.platform === "win32") {
          // Use PowerShell with STA mode for Windows Forms dialogs
          const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select a folder to open in OpenCode"
$dialog.ShowNewFolderButton = $true
${lastDir ? `$dialog.SelectedPath = "${lastDir.replace(/\\/g, "\\\\")}"` : ""}

# Create a form to ensure dialog appears on top
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.StartPosition = "CenterScreen"
$form.WindowState = "Minimized"
$form.ShowInTaskbar = $false

$result = $dialog.ShowDialog($form)

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}

$form.Dispose()
$dialog.Dispose()
          `.trim()

          // Write PowerShell script to temp file
          const tempPs1 = path.join(os.tmpdir(), `opencode-picker-${Date.now()}.ps1`)
          fs.writeFileSync(tempPs1, psScript, "utf-8")

          try {
            // Run PowerShell with STA mode (required for Windows Forms)
            const { stdout, stderr } = await execAsync(
              `powershell -ExecutionPolicy Bypass -STA -File "${tempPs1}"`,
              {
                windowsHide: false,
                timeout: 300000, // 5 minute timeout for user to select folder
              }
            )

            // Clean up temp file
            fs.unlinkSync(tempPs1)

            if (stderr) {
              log.error("PowerShell error:", { stderr })
            }

            const selectedPath = stdout.trim()

            if (!selectedPath) {
              return c.json({
                success: false,
                error: "No directory selected or dialog was cancelled",
              })
            }

            // Save the selected path as the last directory
            saveLastDirectory(selectedPath)

            return c.json({
              success: true,
              paths: [selectedPath],
            })
          } catch (error) {
            // Clean up temp file on error
            if (fs.existsSync(tempPs1)) {
              fs.unlinkSync(tempPs1)
            }
            
            // Check if timeout error
            if (error.message?.includes("timeout")) {
              return c.json({
                success: false,
                error: "Dialog selection timed out after 5 minutes",
              })
            }
            
            throw error
          }
        }

        // macOS - Use osascript
        if (process.platform === "darwin") {
          const defaultFolder = lastDir ? ` default location POSIX file "${lastDir}"` : ""
          const script = `
tell application "System Events"
    activate
    set folderPath to choose folder with prompt "Select a folder"${defaultFolder}
    return POSIX path of folderPath
end tell
          `.trim()

          const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "\\'")}'`)

          const path = stdout.trim()
          if (!path) {
            return c.json({
              success: false,
              error: "No directory selected",
            })
          }

          // Save the selected path as the last directory
          saveLastDirectory(path)

          return c.json({
            success: true,
            paths: [path],
          })
        }

        // Linux - Use zenity or kdialog
        if (process.platform === "linux") {
          const startDir = lastDir || "."
          try {
            // Try zenity first
            const { stdout } = await execAsync(`zenity --file-selection --directory --title="Select a folder" --filename="${startDir}/"`)
            const path = stdout.trim()

            if (!path) {
              return c.json({
                success: false,
                error: "No directory selected",
              })
            }

            // Save the selected path as the last directory
            saveLastDirectory(path)

            return c.json({
              success: true,
              paths: [path],
            })
          } catch (zenityErr) {
            // Try kdialog as fallback
            try {
              const { stdout } = await execAsync(`kdialog --getexistingdirectory "${startDir}" "Select a folder"`)
              const path = stdout.trim()

              if (!path) {
                return c.json({
                  success: false,
                  error: "No directory selected",
                })
              }

              // Save the selected path as the last directory
              saveLastDirectory(path)

              return c.json({
                success: true,
                paths: [path],
              })
            } catch (kdialogErr) {
              return c.json({
                success: false,
                error: "No file picker available (install zenity or kdialog)",
              })
            }
          }
        }

        return c.json({
          success: false,
          error: "Unsupported platform",
        })
      } catch (error) {
        log.error("Failed to open directory picker", { error })
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }
  )

  return app
}
