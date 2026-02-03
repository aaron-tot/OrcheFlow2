/**
 * LSP Server Registry
 * Purpose: Central barrel export for all LSP servers
 */

// Core types and utilities
export { LSPServer } from "./server-core"

// JavaScript/TypeScript servers
export { Deno, Typescript, Vue, ESLint } from "./servers/javascript"

// Frontend framework servers
export { Svelte, Astro } from "./servers/frontend"

// Linters
export { Oxlint, Biome } from "./servers/linters"

// Systems languages - Part 1
export { Gopls, RustAnalyzer, Clangd } from "./servers/systems-1"

// Systems languages - Part 2
export { Zls, CSharp, FSharp, SourceKit } from "./servers/systems-2"

// JVM languages
export { JDTLS, KotlinLS } from "./servers/jvm"

// Dynamic languages - Part 1
export { Rubocop, Ty, Pyright } from "./servers/dynamic-1"

// Dynamic languages - Part 2
export { ElixirLS, Dart, PHPIntelephense } from "./servers/dynamic-2"

// Functional languages
export { Ocaml, Gleam, Clojure, HLS } from "./servers/functional"

// Configuration languages - Part 1
export { YamlLS, LuaLS, Prisma, BashLS } from "./servers/config-1"

// Configuration languages - Part 2
export { DockerfileLS, TerraformLS, TexLab, Nixd, Tinymist } from "./servers/config-2"

// Server registry array (for backwards compatibility)
import * as JavaScriptServers from "./servers/javascript"
import * as FrontendServers from "./servers/frontend"
import * as LinterServers from "./servers/linters"
import * as Systems1Servers from "./servers/systems-1"
import * as Systems2Servers from "./servers/systems-2"
import * as JVMServers from "./servers/jvm"
import * as Dynamic1Servers from "./servers/dynamic-1"
import * as Dynamic2Servers from "./servers/dynamic-2"
import * as FunctionalServers from "./servers/functional"
import * as Config1Servers from "./servers/config-1"
import * as Config2Servers from "./servers/config-2"
import type { LSPServer } from "./server-core"

export const ALL_SERVERS: LSPServer.Info[] = [
  // JavaScript/TypeScript
  JavaScriptServers.Deno,
  JavaScriptServers.Typescript,
  JavaScriptServers.Vue,
  JavaScriptServers.ESLint,
  // Frontend frameworks
  FrontendServers.Svelte,
  FrontendServers.Astro,
  // Linters
  LinterServers.Oxlint,
  LinterServers.Biome,
  // Systems - Part 1
  Systems1Servers.Gopls,
  Systems1Servers.RustAnalyzer,
  Systems1Servers.Clangd,
  // Systems - Part 2
  Systems2Servers.Zls,
  Systems2Servers.CSharp,
  Systems2Servers.FSharp,
  Systems2Servers.SourceKit,
  // JVM
  JVMServers.JDTLS,
  JVMServers.KotlinLS,
  // Dynamic - Part 1
  Dynamic1Servers.Rubocop,
  Dynamic1Servers.Ty,
  Dynamic1Servers.Pyright,
  // Dynamic - Part 2
  Dynamic2Servers.ElixirLS,
  Dynamic2Servers.Dart,
  Dynamic2Servers.PHPIntelephense,
  // Functional
  FunctionalServers.Ocaml,
  FunctionalServers.Gleam,
  FunctionalServers.Clojure,
  FunctionalServers.HLS,
  // Config - Part 1
  Config1Servers.YamlLS,
  Config1Servers.LuaLS,
  Config1Servers.Prisma,
  Config1Servers.BashLS,
  // Config - Part 2
  Config2Servers.DockerfileLS,
  Config2Servers.TerraformLS,
  Config2Servers.TexLab,
  Config2Servers.Nixd,
  Config2Servers.Tinymist,
]
