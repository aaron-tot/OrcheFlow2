import { spawn } from "child_process"
import { LSPServer } from "../server-core"

/**
 * Functional Language Servers
 * Purpose: OCaml, Gleam, Clojure, Haskell servers
 */

export const Ocaml: LSPServer.Info = {
  id: "ocaml-lsp",
  extensions: [".ml", ".mli"],
  root: LSPServer.NearestRoot(["dune-project", "dune-workspace", ".merlin", "opam"]),
  async spawn(root) {
    const bin = Bun.which("ocamllsp")
    if (!bin) {
      LSPServer.log.info("ocamllsp not found, please install ocaml-lsp-server")
      return
    }
    return {
      process: spawn(bin, {
        cwd: root,
      }),
    }
  },
}

export const Gleam: LSPServer.Info = {
  id: "gleam",
  extensions: [".gleam"],
  root: LSPServer.NearestRoot(["gleam.toml"]),
  async spawn(root) {
    const gleam = Bun.which("gleam")
    if (!gleam) {
      LSPServer.log.info("gleam not found, please install gleam first")
      return
    }
    return {
      process: spawn(gleam, ["lsp"], {
        cwd: root,
      }),
    }
  },
}

export const Clojure: LSPServer.Info = {
  id: "clojure-lsp",
  extensions: [".clj", ".cljs", ".cljc", ".edn"],
  root: LSPServer.NearestRoot(["deps.edn", "project.clj", "shadow-cljs.edn", "bb.edn", "build.boot"]),
  async spawn(root) {
    let bin = Bun.which("clojure-lsp")
    if (!bin && process.platform === "win32") {
      bin = Bun.which("clojure-lsp.exe")
    }
    if (!bin) {
      LSPServer.log.info("clojure-lsp not found, please install clojure-lsp first")
      return
    }
    return {
      process: spawn(bin, ["listen"], {
        cwd: root,
      }),
    }
  },
}

export const HLS: LSPServer.Info = {
  id: "haskell-language-server",
  extensions: [".hs", ".lhs"],
  root: LSPServer.NearestRoot(["stack.yaml", "cabal.project", "hie.yaml", "*.cabal"]),
  async spawn(root) {
    const bin = Bun.which("haskell-language-server-wrapper")
    if (!bin) {
      LSPServer.log.info("haskell-language-server-wrapper not found, please install haskell-language-server")
      return
    }
    return {
      process: spawn(bin, ["--lsp"], {
        cwd: root,
      }),
    }
  },
}
