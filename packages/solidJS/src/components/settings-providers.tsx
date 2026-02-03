import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tag } from "@opencode-ai/ui/tag"
import { showToast } from "@opencode-ai/ui/toast"
import { iconNames, type IconName } from "@opencode-ai/ui/icons/provider"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { createMemo, createSignal, onMount, onCleanup, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useServer } from "@/context/server"
import { DialogConnectProvider } from "@/features/providers/components/dialog-connect-provider"
import { DialogSelectProvider } from "./dialog-select-provider"
import { DialogCustomProvider } from "./dialog-custom-provider"

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderMeta = { source?: ProviderSource }

export const SettingsProviders: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const providers = useProviders()
  const server = useServer()
  
  // Provider connection status
  const [providerStatuses, setProviderStatuses] = createSignal<Record<string, 'checking' | 'connected' | 'disconnected'>>({})
  
  // Check provider connection
  const checkProviderConnection = async (providerId: string) => {
    setProviderStatuses(prev => ({ ...prev, [providerId]: 'checking' }))
    
    try {
      // Use backend endpoint to test connection (server-side test avoids CORS issues)
      const response = await fetch(`${server.url}/auth/${providerId}/test`)
      if (!response.ok) {
        setProviderStatuses(prev => ({ ...prev, [providerId]: 'disconnected' }))
        return
      }
      
      const result = await response.json()
      setProviderStatuses(prev => ({ 
        ...prev, 
        [providerId]: result.connected ? 'connected' : 'disconnected' 
      }))
      
      // If connected, reload providers to get updated models
      if (result.connected && providerId === 'ollama-local') {
        console.log('[Settings] Ollama connected, triggering model refresh...')
        showToast({
          variant: "info",
          icon: "arrows-rotate",
          title: "Refreshing Models",
          description: "Loading latest Ollama models...",
        })
        
        try {
          // Call refresh endpoint directly
          const refreshResponse = await fetch(`${server.url}/provider/ollama-local/refresh`, {
            method: 'POST'
          })
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            console.log('[Settings] Refreshed models:', refreshData)
            
            // Now reload the provider list
            await globalSync.bootstrap()
            
            showToast({
              variant: "success",
              icon: "circle-check",
              title: "Models Updated",
              description: `Refreshed ${refreshData.count} Ollama models`,
            })
          } else {
            throw new Error('Failed to refresh models')
          }
        } catch (err) {
          console.error('[Settings] Failed to refresh Ollama models:', err)
          showToast({
            variant: "error",
            icon: "circle-exclamation",
            title: "Refresh Failed",
            description: "Could not update Ollama models",
          })
        }
      }
    } catch (err) {
      setProviderStatuses(prev => ({ ...prev, [providerId]: 'disconnected' }))
    }
  }
  
  // Check all connected providers when mounting or when tab is clicked
  const checkAllProviders = () => {
    for (const provider of connected()) {
      void checkProviderConnection(provider.id)
    }
  }
  
  // Ollama control state
  const [ollamaStatus, setOllamaStatus] = createSignal<{ running: boolean; port?: number; pid?: number } | null>(null)
  const [ollamaLoading, setOllamaLoading] = createSignal(false)
  
  // Poll Ollama status
  const checkOllamaStatus = async () => {
    try {
      const response = await fetch(`${server.url}/ollama/status`)
      if (response.ok) {
        const data = await response.json()
        setOllamaStatus(data)
      }
    } catch (err) {
      console.error('Failed to check Ollama status:', err)
    }
  }
  
  // Start Ollama
  const startOllama = async () => {
    setOllamaLoading(true)
    try {
      const response = await fetch(`${server.url}/ollama/start`, { method: 'POST' })
      if (response.ok) {
        // Wait a bit for Ollama to start
        setTimeout(() => {
          void checkOllamaStatus()
          setOllamaLoading(false)
        }, 2000)
        showToast({
          variant: "success",
          icon: "circle-check",
          title: "Ollama Started",
          description: "Ollama server is starting...",
        })
      } else {
        throw new Error('Failed to start Ollama')
      }
    } catch (err) {
      setOllamaLoading(false)
      const message = err instanceof Error ? err.message : String(err)
      showToast({ 
        variant: "error",
        title: "Failed to start Ollama", 
        description: message 
      })
    }
  }
  
  // Stop Ollama
  const stopOllama = async () => {
    setOllamaLoading(true)
    try {
      const response = await fetch(`${server.url}/ollama/stop`, { method: 'POST' })
      if (response.ok) {
        await checkOllamaStatus()
        setOllamaLoading(false)
        showToast({
          variant: "success",
          icon: "circle-check",
          title: "Ollama Stopped",
          description: "Ollama server has been stopped.",
        })
      } else {
        throw new Error('Failed to stop Ollama')
      }
    } catch (err) {
      setOllamaLoading(false)
      const message = err instanceof Error ? err.message : String(err)
      showToast({ 
        variant: "error",
        title: "Failed to stop Ollama", 
        description: message 
      })
    }
  }
  
  // Poll status every 5 seconds when component is mounted
  let statusInterval: ReturnType<typeof setInterval> | undefined
  onMount(() => {
    void checkOllamaStatus()
    checkAllProviders()
    statusInterval = setInterval(() => {
      void checkOllamaStatus()
    }, 5000)
  })
  
  onCleanup(() => {
    if (statusInterval) clearInterval(statusInterval)
  })

  const icon = (id: string): IconName => {
    if (iconNames.includes(id as IconName)) return id as IconName
    return "synthetic"
  }

  const connected = createMemo(() => {
    return providers
      .connected()
      .filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input))
  })
  
  // Check if ollama-local provider is configured
  const hasOllamaLocal = createMemo(() => {
    return connected().some(p => p.id === 'ollama-local')
  })

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    const items = providers
      .popular()
      .filter((p) => !connectedIDs.has(p.id))
      .slice()
    items.sort((a, b) => popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id))
    return items
  })

  const source = (item: unknown) => (item as ProviderMeta).source

  const type = (item: unknown) => {
    const current = source(item)
    if (current === "env") return language.t("settings.providers.tag.environment")
    if (current === "api") return language.t("provider.connect.method.apiKey")
    if (current === "config") {
      const id = (item as { id?: string }).id
      if (id && isConfigCustom(id)) return language.t("settings.providers.tag.custom")
      return language.t("settings.providers.tag.config")
    }
    if (current === "custom") return language.t("settings.providers.tag.custom")
    return language.t("settings.providers.tag.other")
  }

  const canDisconnect = (item: unknown) => source(item) !== "env"

  const isConfigCustom = (providerID: string) => {
    const provider = globalSync.data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  const disableProvider = async (providerID: string, name: string) => {
    const before = globalSync.data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    globalSync.set("config", "disabled_providers", next)

    await globalSync
      .updateConfig({ disabled_providers: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        globalSync.set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const disconnect = async (providerID: string, name: string) => {
    if (isConfigCustom(providerID)) {
      await globalSDK.client.auth.remove({ providerID }).catch(() => undefined)
      await disableProvider(providerID, name)
      return
    }
    await globalSDK.client.auth
      .remove({ providerID })
      .then(async () => {
        await globalSDK.client.global.dispose()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex items-center justify-between pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.providers.title")}</h2>
          <Button size="medium" variant="secondary" onClick={checkAllProviders}>
            Refresh Status
          </Button>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.providers.section.connected")}</h3>
          <div class="bg-surface-raised-base px-4 rounded-lg">
            <Show
              when={connected().length > 0}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">
                  {language.t("settings.providers.connected.empty")}
                </div>
              }
            >
              <For each={connected()}>
                {(item) => (
                  <div class="group flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                    <div class="flex items-center gap-x-3 min-w-0 flex-1">
                      <ProviderIcon id={icon(item.id)} class="size-5 shrink-0 icon-strong-base" />
                      <div class="flex flex-col min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="text-14-medium text-text-strong truncate">{item.name}</span>
                          <Tag>{type(item)}</Tag>
                        </div>
                        <div class="flex items-center gap-2 mt-0.5">
                          <span class="text-12-regular text-text-weak">Status:</span>
                          <Show when={providerStatuses()[item.id] === 'checking'}>
                            <span class="text-12-regular text-text-weak">Checking...</span>
                          </Show>
                          <Show when={providerStatuses()[item.id] === 'connected'}>
                            <span class="text-12-regular text-green-600 dark:text-green-400">Connected</span>
                          </Show>
                          <Show when={providerStatuses()[item.id] === 'disconnected'}>
                            <span class="text-12-regular text-red-600 dark:text-red-400">Disconnected</span>
                          </Show>
                          <Show when={!providerStatuses()[item.id]}>
                            <span class="text-12-regular text-text-weak">Unknown</span>
                          </Show>
                        </div>
                      </div>
                    </div>
                    <Show
                      when={canDisconnect(item)}
                      fallback={
                        <span class="text-14-regular text-text-base opacity-0 group-hover:opacity-100 transition-opacity duration-200 pr-3 cursor-default">
                          Connected from your environment variables
                        </span>
                      }
                    >
                      <Button size="large" variant="ghost" onClick={() => void disconnect(item.id, item.name)}>
                        {language.t("common.disconnect")}
                      </Button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.providers.section.popular")}</h3>
          <div class="bg-surface-raised-base px-4 rounded-lg">
            <For each={popular()}>
              {(item) => (
                <div class="flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-x-3">
                      <ProviderIcon id={icon(item.id)} class="size-5 shrink-0 icon-strong-base" />
                      <span class="text-14-medium text-text-strong">{item.name}</span>
                      <Show when={item.id === "opencode"}>
                        <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                      </Show>
                    </div>
                    <Show when={item.id === "opencode"}>
                      <span class="text-12-regular text-text-weak pl-8">
                        {language.t("dialog.provider.opencode.note")}
                      </span>
                    </Show>
                    <Show when={item.id === "anthropic"}>
                      <span class="text-12-regular text-text-weak pl-8">
                        {language.t("dialog.provider.anthropic.note")}
                      </span>
                    </Show>
                    <Show when={item.id.startsWith("github-copilot")}>
                      <span class="text-12-regular text-text-weak pl-8">
                        {language.t("dialog.provider.copilot.note")}
                      </span>
                    </Show>
                    <Show when={item.id === "openai"}>
                      <span class="text-12-regular text-text-weak pl-8">
                        {language.t("dialog.provider.openai.note")}
                      </span>
                    </Show>
                    <Show when={item.id === "google"}>
                      <span class="text-12-regular text-text-weak pl-8">
                        {language.t("dialog.provider.google.note")}
                      </span>
                    </Show>
                    <Show when={item.id === "openrouter"}>
                      <span class="text-12-regular text-text-weak pl-8">
                        {language.t("dialog.provider.openrouter.note")}
                      </span>
                    </Show>
                    <Show when={item.id === "vercel"}>
                      <span class="text-12-regular text-text-weak pl-8">
                        {language.t("dialog.provider.vercel.note")}
                      </span>
                    </Show>
                  </div>
                  <Button
                    size="large"
                    variant="secondary"
                    icon="plus-small"
                    onClick={() => {
                      dialog.show(() => <DialogConnectProvider provider={item.id} />)
                    }}
                  >
                    {language.t("common.connect")}
                  </Button>
                </div>
              )}
            </For>

            <div class="flex items-center justify-between gap-4 h-16 border-b border-border-weak-base last:border-none">
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-x-3">
                  <ProviderIcon id={icon("synthetic")} class="size-5 shrink-0 icon-strong-base" />
                  <span class="text-14-medium text-text-strong">Custom provider</span>
                  <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                </div>
                <span class="text-12-regular text-text-weak pl-8">Add an OpenAI-compatible provider by base URL.</span>
              </div>
              <Button
                size="large"
                variant="secondary"
                icon="plus-small"
                onClick={() => {
                  dialog.show(() => <DialogCustomProvider back="close" />)
                }}
              >
                {language.t("common.connect")}
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            class="px-0 py-0 mt-5 text-14-medium text-text-interactive-base text-left justify-start hover:bg-transparent active:bg-transparent"
            onClick={() => {
              dialog.show(() => <DialogSelectProvider />)
            }}
          >
            {language.t("dialog.provider.viewAll")}
          </Button>
        </div>
        
        {/* Ollama Control Section */}
        <Show when={hasOllamaLocal()}>
          <div class="flex flex-col gap-1">
            <h3 class="text-14-medium text-text-strong pb-2">Ollama Server Control</h3>
            <div class="bg-surface-raised-base px-4 rounded-lg">
              <div class="flex items-center justify-between gap-4 min-h-16 py-3">
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-x-3">
                    <ProviderIcon id="ollama-local" class="size-5 shrink-0 icon-strong-base" />
                    <span class="text-14-medium text-text-strong">Ollama Local Server</span>
                    <Show when={ollamaStatus()?.running} fallback={<Tag variant="warning">Stopped</Tag>}>
                      <Tag variant="success">Running</Tag>
                    </Show>
                  </div>
                  <Show when={ollamaStatus()?.running && ollamaStatus()?.port}>
                    <span class="text-12-regular text-text-weak pl-8">
                      Running on port {ollamaStatus()!.port} (PID: {ollamaStatus()!.pid})
                    </span>
                  </Show>
                  <Show when={!ollamaStatus()?.running}>
                    <span class="text-12-regular text-text-weak pl-8">
                      Start the Ollama server to use local models
                    </span>
                  </Show>
                </div>
                <Show 
                  when={ollamaStatus()?.running} 
                  fallback={
                    <Button
                      size="large"
                      variant="secondary"
                      icon="play"
                      onClick={startOllama}
                      disabled={ollamaLoading()}
                    >
                      {ollamaLoading() ? "Starting..." : "Start"}
                    </Button>
                  }
                >
                  <Button
                    size="large"
                    variant="ghost"
                    icon="stop"
                    onClick={stopOllama}
                    disabled={ollamaLoading()}
                  >
                    {ollamaLoading() ? "Stopping..." : "Stop"}
                  </Button>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
