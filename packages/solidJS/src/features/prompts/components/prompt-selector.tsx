import { Button } from "@opencode-ai/ui/button"
import { Popover } from "@opencode-ai/ui/popover"
import { Icon } from "@opencode-ai/ui/icon"
import { MorphChevron } from "@opencode-ai/ui/morph-chevron"
import { showToast } from "@opencode-ai/ui/toast"
import { createSignal, createResource, For, Show, type Component, type ValidComponent } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useServer } from "@/context/server"

export function PromptSelectorPopover<T extends ValidComponent = "div">(props: {
  triggerAs?: T
  triggerProps?: any
  children?: (open: boolean, displayName: string) => any
}) {
  const server = useServer()
  const [open, setOpen] = createSignal(false)
  const [selectedPrompt, setSelectedPrompt] = createSignal<string | null>(null)

  // Fetch available prompts
  const [prompts] = createResource(
    () => open(),
    async () => {
      if (!open()) return []
      try {
        const response = await fetch(`${server.url}/prompt/list`)
        if (response.ok) {
          return await response.json() as string[]
        }
      } catch (e) {
        console.error('Failed to fetch prompts:', e)
      }
      return []
    }
  )

  // Fetch currently selected prompt
  const [currentPrompt] = createResource(async () => {
    try {
      const response = await fetch(`${server.url}/prompt/selected`)
      if (response.ok) {
        const selected = await response.json()
        setSelectedPrompt(selected)
        return selected
      }
    } catch (e) {
      console.error('Failed to fetch selected prompt:', e)
    }
    return null
  })

  const handleSelectPrompt = async (prompt: string) => {
    try {
      const response = await fetch(`${server.url}/prompt/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      if (response.ok) {
        setSelectedPrompt(prompt)
        setOpen(false)
        showToast({
          variant: "success",
          icon: "circle-check",
          title: "System Prompt Updated",
          description: `Using ${prompt.replace('.txt', '')} for new conversations`,
        })
      }
    } catch (e) {
      console.error('Failed to select prompt:', e)
      showToast({
        variant: "error",
        icon: "circle-exclamation",
        title: "Failed to Update Prompt",
        description: "Could not save prompt selection",
      })
    }
  }

  const displayName = () => {
    const current = selectedPrompt()
    if (current) {
      return current.replace('.txt', '').replace('prompt/', '')
    }
    return 'Auto'
  }

  return (
    <Popover 
      open={open()} 
      onOpenChange={setOpen}
      triggerAs={props.triggerAs ?? ("div" as any)}
      triggerProps={props.triggerProps}
      trigger={
        props.children ? (
          props.children(open(), displayName())
        ) : (
          <>
            <Icon name="file-lines" class="size-4" />
            <span class="text-12-regular">{displayName()}</span>
            <MorphChevron expanded={open()} class="text-text-weak" />
          </>
        )
      }
      class="w-64 [&_[data-slot=popover-body]]:p-2"
      gutter={4}
    >
      <div class="flex flex-col gap-1">
        <div class="px-2 py-1.5 text-11-medium text-text-weak uppercase">System Prompts</div>
        <Show when={!prompts.loading} fallback={<div class="px-2 py-1.5 text-12-regular text-text-base">Loading...</div>}>
          <Show when={Array.isArray(prompts()) && prompts()!.length > 0} fallback={<div class="px-2 py-1.5 text-12-regular text-text-base">No prompts found</div>}>
            <button
              class="px-2 py-1.5 text-12-regular text-left rounded hover:bg-surface-alt transition-colors"
              classList={{ "bg-surface-alt": selectedPrompt() === null }}
              onClick={() => handleSelectPrompt('')}
            >
              <div class="flex items-center justify-between">
                <span>Auto (Default)</span>
                <Show when={selectedPrompt() === null}>
                  <Icon name="check" class="size-3.5 text-icon-brand" />
                </Show>
              </div>
            </button>
            <For each={Array.isArray(prompts()) ? prompts()! : []}>
              {(prompt) => (
                <button
                  class="px-2 py-1.5 text-12-regular text-left rounded hover:bg-surface-alt transition-colors"
                  classList={{ "bg-surface-alt": selectedPrompt() === prompt }}
                  onClick={() => handleSelectPrompt(prompt)}
                >
                  <div class="flex items-center justify-between">
                    <span>{prompt.replace('.txt', '').replace('prompt/', '')}</span>
                    <Show when={selectedPrompt() === prompt}>
                      <Icon name="check" class="size-3.5 text-icon-brand" />
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </Popover>
  )
}
