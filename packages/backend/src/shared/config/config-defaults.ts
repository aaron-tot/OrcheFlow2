/**
 * Config Defaults: Default values and constants
 * Split from config.ts for better maintainability and token efficiency
 */

// ============================================================================
// Path Constants
// ============================================================================

export const COMMAND_GLOB = new Bun.Glob("{command,commands}/**/*.md")
export const AGENT_GLOB = new Bun.Glob("{agent,agents}/**/*.md")
export const MODE_GLOB = new Bun.Glob("{mode,modes}/*.md")
export const PLUGIN_GLOB = new Bun.Glob("{plugin,plugins}/*.{ts,js}")

// ============================================================================
// Pattern Constants for File Path Resolution
// ============================================================================

export const COMMAND_PATTERNS = ["/.opencode/command/", "/.opencode/commands/", "/command/", "/commands/"]
export const AGENT_PATTERNS = ["/.opencode/agent/", "/.opencode/agents/", "/agent/", "/agents/"]

// ============================================================================
// Git Ignore Template
// ============================================================================

export const DEFAULT_GITIGNORE_ENTRIES = ["node_modules", "package.json", "bun.lock", ".gitignore"]

// ============================================================================
// Config File Candidates
// ============================================================================

export const GLOBAL_CONFIG_FILES = ["opencode.jsonc", "opencode.json", "config.json"]
export const PROJECT_CONFIG_FILES = ["opencode.jsonc", "opencode.json"]

// ============================================================================
// Default Schema URL
// ============================================================================

export const DEFAULT_SCHEMA_URL = "https:/opencode.ai/config.json"
