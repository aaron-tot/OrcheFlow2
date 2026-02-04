import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "../features/cli/commands/run"
import { GenerateCommand } from "../features/cli/commands/generate"
import { Log } from "../shared/utils/log"
import { AuthCommand } from "../features/cli/commands/auth"
import { AgentCommand } from "../features/cli/commands/agent"
import { UpgradeCommand } from "../features/cli/commands/upgrade"
import { UninstallCommand } from "../features/cli/commands/uninstall"
import { ModelsCommand } from "../features/cli/commands/models"
import { UI } from "../features/cli/services/ui"
import { Installation } from "../features/cli/infrastructure/installation"
import { NamedError } from "../../../util/src/error"
import { FormatError } from "../features/cli/services/error"
import { ServeCommand } from "../features/cli/commands/serve"
import { DebugCommand } from "../features/cli/commands/debug"
import { StatsCommand } from "../features/cli/commands/stats"
import { McpCommand } from "../features/cli/commands/mcp"
import { GithubCommand } from "../features/cli/commands/github"
import { ExportCommand } from "../features/cli/commands/export"
import { ImportCommand } from "../features/cli/commands/import"
// Disabled TUI commands that require React/JSX
// import { AttachCommand } from "../features/cli/commands/tui/attach"
// import { TuiThreadCommand } from "../features/cli/commands/tui/thread"
import { AcpCommand } from "../features/cli/commands/acp"
import { EOL } from "os"
import { WebCommand } from "../features/cli/commands/web"
import { PrCommand } from "../features/cli/commands/pr"
import { SessionCommand } from "../features/cli/commands/session"
import { AuditCommand } from "../features/cli/commands/audit"

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})

const cli = yargs(hideBin(process.argv))
  .parserConfiguration({ "populate--": true })
  .scriptName("opencode")
  .wrap(100)
  .help("help", "show help")
  .alias("help", "h")
  .version("version", "show version number", Installation.VERSION)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .middleware(async (opts) => {
    await Log.init({
      print: process.argv.includes("--print-logs"),
      dev: Installation.isLocal(),
      level: (() => {
        if (opts.logLevel) return opts.logLevel as Log.Level
        if (Installation.isLocal()) return "DEBUG"
        return "INFO"
      })(),
    })

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"

    Log.Default.info("opencode", {
      version: Installation.VERSION,
      args: process.argv.slice(2),
    })
  })
  .usage("\n" + UI.logo())
  .completion("completion", "generate shell completion script")
  .command(AcpCommand)
  .command(McpCommand)
  // .command(TuiThreadCommand)  // Disabled - requires React/JSX
  // .command(AttachCommand)      // Disabled - requires React/JSX
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  .command(AuthCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  .command(WebCommand)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  .command(GithubCommand)
  .command(PrCommand)
  .command(SessionCommand)
  .command(AuditCommand)
  .fail((msg, err) => {
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:")
    ) {
      if (err) throw err
      cli.showHelp("log")
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  console.log('[DEBUG cli.ts] Before parse()');
  await cli.parse()
  console.log('[DEBUG cli.ts] After parse()');
} catch (e) {
  console.log('[DEBUG cli.ts] Error caught:', e);
  let data: Record<string, any> = {}
  if (e instanceof NamedError) {
    const obj = e.toObject()
    Object.assign(data, {
      ...obj.data,
    })
  }

  if (e instanceof Error) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      cause: e.cause?.toString(),
      stack: e.stack,
    })
  }

  if (e instanceof ResolveMessage) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      code: e.code,
      specifier: e.specifier,
      referrer: e.referrer,
      position: e.position,
      importKind: e.importKind,
    })
  }
  Log.Default.error("fatal", data)
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL)
    console.error(e instanceof Error ? e.message : String(e))
  }
  process.exitCode = 1
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
