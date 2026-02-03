import { $ } from "bun"
import { writeFileSync, chmodSync, mkdirSync } from "fs"
import { resolve } from "path"

// For development, create a wrapper script that runs the CLI from the workspace
console.log("⚡ Creating development sidecar wrapper...")

const sidecarDir = resolve(import.meta.dir, "../src-tauri/sidecars")
const cliPath = resolve(import.meta.dir, "../../cli/src/index.ts")

// Create sidecars directory
try {
  mkdirSync(sidecarDir, { recursive: true })
} catch (e) {
  // Directory might already exist
}

if (process.platform === "win32") {
  // Windows: Create a .bat wrapper
  const wrapperPath = resolve(sidecarDir, "opencode-cli.exe.bat")
  const wrapperContent = `@echo off\nbun run "${cliPath.replace(/\\/g, "\\")}" %*`
  writeFileSync(wrapperPath, wrapperContent)
  console.log("✅ Created Windows wrapper:", wrapperPath)
} else {
  // Unix: Create a shell script wrapper
  const wrapperPath = resolve(sidecarDir, "opencode-cli")
  const wrapperContent = `#!/bin/sh\nexec bun run "${cliPath}" "$@"`
  writeFileSync(wrapperPath, wrapperContent)
  chmodSync(wrapperPath, 0o755)
  console.log("✅ Created Unix wrapper:", wrapperPath)
}

console.log("   The desktop app will use the CLI from the workspace")
