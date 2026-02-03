// @refresh reload
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { Platform, PlatformProvider } from "@/context/platform"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"
import pkg from "../package.json"

const DEFAULT_SERVER_URL_KEY = "opencode.settings.dat:defaultServerUrl"

const root = document.getElementById("root")
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  const locale = (() => {
    if (typeof navigator !== "object") return "en" as const
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const language of languages) {
      if (!language) continue
      if (language.toLowerCase().startsWith("zh")) return "zh" as const
    }
    return "en" as const
  })()

  const key = "error.dev.rootNotFound" as const
  const message = locale === "zh" ? (zh[key] ?? en[key]) : en[key]
  throw new Error(message)
}

const platform: Platform = {
  platform: "web",
  version: pkg.version,
  openLink(url: string) {
    window.open(url, "_blank")
  },
  back() {
    window.history.back()
  },
  forward() {
    window.history.forward()
  },
  restart: async () => {
    window.location.reload()
  },
  notify: async (title, description, href) => {
    if (!("Notification" in window)) return

    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission().catch(() => "denied")
        : Notification.permission

    if (permission !== "granted") return

    const inView = document.visibilityState === "visible" && document.hasFocus()
    if (inView) return

    await Promise.resolve()
      .then(() => {
        const notification = new Notification(title, {
          body: description ?? "",
          icon: "https://opencode.ai/favicon-96x96-v3.png",
        })
        notification.onclick = () => {
          window.focus()
          if (href) {
            window.history.pushState(null, "", href)
            window.dispatchEvent(new PopStateEvent("popstate"))
          }
          notification.close()
        }
      })
      .catch(() => undefined)
  },
  getDefaultServerUrl: () => {
    if (typeof localStorage === "undefined") return null
    try {
      return localStorage.getItem(DEFAULT_SERVER_URL_KEY)
    } catch {
      return null
    }
  },
  setDefaultServerUrl: (url) => {
    if (typeof localStorage === "undefined") return
    try {
      if (url) {
        localStorage.setItem(DEFAULT_SERVER_URL_KEY, url)
        return
      }
      localStorage.removeItem(DEFAULT_SERVER_URL_KEY)
    } catch {
      return
    }
  },
  openDirectoryPickerDialog: async (opts) => {
    console.log("[DEBUG] openDirectoryPickerDialog called with opts:", opts)
    // Call backend API to open native directory picker
    try {
      const multiple = opts?.multiple ?? false
      
      // Get the backend URL (could be custom or default localhost:4001)
      const serverUrl = platform.getDefaultServerUrl?.() || "http://localhost:4001"
      console.log("[DEBUG] Using server URL:", serverUrl)
      
      // Get auth credentials from localStorage if available
      const password = localStorage.getItem("opencode.settings.dat:serverPassword") || ""
      console.log("[DEBUG] Password length:", password.length)
      
      const response = await fetch(`${serverUrl}/system/pick-directory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${btoa(`opencode:${password}`)}`,
        },
        body: JSON.stringify({ multiple }),
      })

      console.log("[DEBUG] Response status:", response.status, response.statusText)

      if (!response.ok) {
        console.error("Failed to open directory picker:", response.statusText)
        return null
      }

      const result = await response.json()
      console.log("[DEBUG] Response data:", result)
      
      if (!result.success) {
        console.error("Directory picker error:", result.error)
        return null
      }

      if (!result.paths || result.paths.length === 0) {
        return null
      }

      return multiple ? result.paths : result.paths[0]
    } catch (err) {
      console.error("Failed to open directory picker:", err)
      return null
    }
  },
}

render(
  () => (
    <PlatformProvider value={platform}>
      <AppBaseProviders>
        <AppInterface />
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root!,
)
