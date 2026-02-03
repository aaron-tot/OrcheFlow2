import { Component, createSignal, onMount, onCleanup } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"

interface ChatNavigationProps {
  containerRef: HTMLElement | undefined
  class?: string
}

export const ChatNavigation: Component<ChatNavigationProps> = (props) => {
  const [opacity, setOpacity] = createSignal(0.3)

  // Add fade effect to a message element
  const addFadeEffect = (element: HTMLElement) => {
    element.style.transition = "background-color 0.6s ease"
    element.style.backgroundColor = "rgba(var(--color-accent-base-rgb, 74, 144, 226), 0.15)"
    
    setTimeout(() => {
      element.style.backgroundColor = "transparent"
    }, 600)
  }

  // Scroll to top
  const scrollToTop = () => {
    props.containerRef?.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Scroll to bottom
  const scrollToBottom = () => {
    const container = props.containerRef
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
    }
  }

  // Find positions of user messages
  const getUserMessagePositions = (): { position: number; element: HTMLElement }[] => {
    const container = props.containerRef
    if (!container) return []

    const messageElements = container.querySelectorAll("[data-message-id]")
    const positions: { position: number; element: HTMLElement }[] = []

    messageElements.forEach((el) => {
      // All elements with data-message-id are user messages
      positions.push({
        position: (el as HTMLElement).offsetTop,
        element: el as HTMLElement
      })
    })

    return positions
  }

  // Jump to previous user message
  const jumpToPreviousMessage = () => {
    const container = props.containerRef
    if (!container) return

    const messages = getUserMessagePositions()
    const currentScroll = container.scrollTop

    // Find the previous message position (largest position that's less than current scroll - 100)
    const previousMessage = messages
      .filter((msg) => msg.position < currentScroll - 100)
      .sort((a, b) => b.position - a.position)[0]

    if (previousMessage) {
      container.scrollTo({ top: previousMessage.position - 50, behavior: "smooth" })
      setTimeout(() => addFadeEffect(previousMessage.element), 300)
    }
  }

  // Jump to next user message
  const jumpToNextMessage = () => {
    const container = props.containerRef
    if (!container) return

    const messages = getUserMessagePositions()
    const currentScroll = container.scrollTop

    // Find the next message position (smallest position that's greater than current scroll + 100)
    const nextMessage = messages
      .filter((msg) => msg.position > currentScroll + 100)
      .sort((a, b) => a.position - b.position)[0]

    if (nextMessage) {
      container.scrollTo({ top: nextMessage.position - 50, behavior: "smooth" })
      setTimeout(() => addFadeEffect(nextMessage.element), 300)
    }
  }

  return (
    <div
      class={`sticky float-right -mr-14 bottom-32 flex flex-col gap-1 transition-opacity duration-200 z-40 ${props.class ?? ""}`}
      style={{ 
        opacity: opacity(),
        clear: "both"
      }}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0.3)}
    >
      {/* Jump to Top */}
      <Tooltip content="Jump to top">
        <button
          onClick={scrollToTop}
          class="p-1.5 rounded-md bg-background-base/80 backdrop-blur-sm border border-border-base hover:bg-background-stronger transition-colors"
          aria-label="Jump to top"
        >
          <Icon name="chevron-grabber-vertical" class="w-3.5 h-3.5 text-foreground-weaker rotate-180" />
        </button>
      </Tooltip>

      {/* Previous Message */}
      <Tooltip content="Previous message">
        <button
          onClick={jumpToPreviousMessage}
          class="p-1.5 rounded-md bg-background-base/80 backdrop-blur-sm border border-border-base hover:bg-background-stronger transition-colors"
          aria-label="Previous message"
        >
          <Icon name="chevron-down" class="w-3.5 h-3.5 text-foreground-weaker rotate-180" />
        </button>
      </Tooltip>

      {/* Next Message */}
      <Tooltip content="Next message">
        <button
          onClick={jumpToNextMessage}
          class="p-1.5 rounded-md bg-background-base/80 backdrop-blur-sm border border-border-base hover:bg-background-stronger transition-colors"
          aria-label="Next message"
        >
          <Icon name="chevron-down" class="w-3.5 h-3.5 text-foreground-weaker" />
        </button>
      </Tooltip>

      {/* Jump to Bottom */}
      <Tooltip content="Jump to bottom">
        <button
          onClick={scrollToBottom}
          class="p-1.5 rounded-md bg-background-base/80 backdrop-blur-sm border border-border-base hover:bg-background-stronger transition-colors"
          aria-label="Jump to bottom"
        >
          <Icon name="chevron-grabber-vertical" class="w-3.5 h-3.5 text-foreground-weaker" />
        </button>
      </Tooltip>
    </div>
  )
}
