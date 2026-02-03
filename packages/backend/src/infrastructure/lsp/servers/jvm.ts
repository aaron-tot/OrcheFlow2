import { spawn } from "child_process"
import path from "path"
import os from "os"
import { Global } from "../../../shared/utils/global"
import { Flag } from "../../../shared/config/flags/flag"
import { Archive } from "../../../shared/utils/archive"
import { $ } from "bun"
import fs from "fs/promises"
import { LSPServer } from "../server-core"

/**
 * JVM Language Servers
 * Purpose: Java JDTLS, Kotlin servers
 */

export const JDTLS: LSPServer.Info = {
  id: "jdtls",
  root: LSPServer.NearestRoot(["pom.xml", "build.gradle", "build.gradle.kts", ".project", ".classpath"]),
  extensions: [".java"],
  async spawn(root) {
    const java = Bun.which("java")
    if (!java) {
      LSPServer.log.error("Java 21 or newer is required to run the JDTLS. Please install it first.")
      return
    }
    const javaMajorVersion = await $`java -version`
      .quiet()
      .nothrow()
      .then(({ stderr }) => {
        const m = /"(\d+)\.\d+\.\d+"/.exec(stderr.toString())
        return !m || !m[1] ? undefined : parseInt(m[1])
      })
    if (javaMajorVersion == null || javaMajorVersion < 21) {
      LSPServer.log.error("JDTLS requires at least Java 21.")
      return
    }
    const distPath = path.join(Global.Path.bin, "jdtls")
    const launcherDir = path.join(distPath, "plugins")
    const installed = await LSPServer.pathExists(launcherDir)
    if (!installed) {
      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("Downloading JDTLS LSP server.")
      await fs.mkdir(distPath, { recursive: true })
      const releaseURL =
        "https:/www.eclipse.org/downloads/download.php?file=/jdtls/snapshots/jdt-language-server-latest.tar.gz"
      const archiveName = "release.tar.gz"

      LSPServer.log.info("Downloading JDTLS archive", { url: releaseURL, dest: distPath })
      const curlResult = await $`curl -L -o ${archiveName} '${releaseURL}'`.cwd(distPath).quiet().nothrow()
      if (curlResult.exitCode !== 0) {
        LSPServer.log.error("Failed to download JDTLS", { exitCode: curlResult.exitCode, stderr: curlResult.stderr.toString() })
        return
      }

      LSPServer.log.info("Extracting JDTLS archive")
      const tarResult = await $`tar -xzf ${archiveName}`.cwd(distPath).quiet().nothrow()
      if (tarResult.exitCode !== 0) {
        LSPServer.log.error("Failed to extract JDTLS", { exitCode: tarResult.exitCode, stderr: tarResult.stderr.toString() })
        return
      }

      await fs.rm(path.join(distPath, archiveName), { force: true })
      LSPServer.log.info("JDTLS download and extraction completed")
    }
    const jarFileName = await $`ls org.eclipse.equinox.launcher_*.jar`
      .cwd(launcherDir)
      .quiet()
      .nothrow()
      .then(({ stdout }) => stdout.toString().trim())
    const launcherJar = path.join(launcherDir, jarFileName)
    if (!(await LSPServer.pathExists(launcherJar))) {
      LSPServer.log.error(`Failed to locate the JDTLS launcher module in the installed directory: ${distPath}.`)
      return
    }
    const configFile = path.join(
      distPath,
      (() => {
        switch (process.platform) {
          case "darwin":
            return "config_mac"
          case "linux":
            return "config_linux"
          case "win32":
            return "config_win"
          default:
            return "config_linux"
        }
      })(),
    )
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-jdtls-data"))
    return {
      process: spawn(
        java,
        [
          "-jar",
          launcherJar,
          "-configuration",
          configFile,
          "-data",
          dataDir,
          "-Declipse.application=org.eclipse.jdt.ls.core.id1",
          "-Dosgi.bundles.defaultStartLevel=4",
          "-Declipse.product=org.eclipse.jdt.ls.core.product",
          "-Dlog.level=ALL",
          "--add-modules=ALL-SYSTEM",
          "--add-opens java.base/java.util=ALL-UNNAMED",
          "--add-opens java.base/java.lang=ALL-UNNAMED",
        ],
        {
          cwd: root,
        },
      ),
    }
  },
}

export const KotlinLS: LSPServer.Info = {
  id: "kotlin-ls",
  extensions: [".kt", ".kts"],
  root: async (file) => {
    // 1) Nearest Gradle root (multi-project or included build)
    const settingsRoot = await LSPServer.NearestRoot(["settings.gradle.kts", "settings.gradle"])(file)
    if (settingsRoot) return settingsRoot
    // 2) Gradle wrapper (strong root signal)
    const wrapperRoot = await LSPServer.NearestRoot(["gradlew", "gradlew.bat"])(file)
    if (wrapperRoot) return wrapperRoot
    // 3) Single-project or module-level build
    const buildRoot = await LSPServer.NearestRoot(["build.gradle.kts", "build.gradle"])(file)
    if (buildRoot) return buildRoot
    // 4) Maven fallback
    return LSPServer.NearestRoot(["pom.xml"])(file)
  },
  async spawn(root) {
    const distPath = path.join(Global.Path.bin, "kotlin-ls")
    const launcherScript =
      process.platform === "win32" ? path.join(distPath, "kotlin-lsp.cmd") : path.join(distPath, "kotlin-lsp.sh")
    const installed = await Bun.file(launcherScript).exists()
    if (!installed) {
      if (Flag.OPENCODE_DISABLE_LSP_DOWNLOAD) return
      LSPServer.log.info("Downloading Kotlin Language Server from GitHub.")

      const releaseResponse = await fetch("https:/api.github.com/repos/Kotlin/kotlin-lsp/releases/latest")
      if (!releaseResponse.ok) {
        LSPServer.log.error("Failed to fetch kotlin-lsp release info")
        return
      }

      const release = (await releaseResponse.json()) as any
      const version = release.name?.replace(/^v/, "")

      if (!version) {
        LSPServer.log.error("Could not determine Kotlin LSP version from release")
        return
      }

      const platform = process.platform
      const arch = process.arch

      let kotlinArch: string = arch
      if (arch === "arm64") kotlinArch = "aarch64"
      else if (arch === "x64") kotlinArch = "x64"

      let kotlinPlatform: string = platform
      if (platform === "darwin") kotlinPlatform = "mac"
      else if (platform === "linux") kotlinPlatform = "linux"
      else if (platform === "win32") kotlinPlatform = "win"

      const supportedCombos = ["mac-x64", "mac-aarch64", "linux-x64", "linux-aarch64", "win-x64", "win-aarch64"]

      const combo = `${kotlinPlatform}-${kotlinArch}`

      if (!supportedCombos.includes(combo)) {
        LSPServer.log.error(`Platform ${platform}/${arch} is not supported by Kotlin LSP`)
        return
      }

      const assetName = `kotlin-lsp-${version}-${kotlinPlatform}-${kotlinArch}.zip`
      const releaseURL = `https:/download-cdn.jetbrains.com/kotlin-lsp/${version}/${assetName}`

      await fs.mkdir(distPath, { recursive: true })
      const archivePath = path.join(distPath, "kotlin-ls.zip")
      await $`curl -L -o '${archivePath}' '${releaseURL}'`.quiet().nothrow()
      const ok = await Archive.extractZip(archivePath, distPath)
        .then(() => true)
        .catch((error) => {
          LSPServer.log.error("Failed to extract Kotlin LS archive", { error })
          return false
        })
      if (!ok) return
      await fs.rm(archivePath, { force: true })
      if (process.platform !== "win32") {
        await $`chmod +x ${launcherScript}`.quiet().nothrow()
      }
      LSPServer.log.info("Installed Kotlin Language Server", { path: launcherScript })
    }
    if (!(await Bun.file(launcherScript).exists())) {
      LSPServer.log.error(`Failed to locate the Kotlin LS launcher script in the installed directory: ${distPath}.`)
      return
    }
    return {
      process: spawn(launcherScript, ["--stdio"], {
        cwd: root,
      }),
    }
  },
}
