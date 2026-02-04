import { HoverCard as Kobalte } from "@kobalte/core/hover-card"
import { ComponentProps, createSignal, JSXElement, ParentProps, Show, splitProps } from "solid-js"

export interface HoverCardProps extends ParentProps, Omit<ComponentProps<typeof Kobalte>, "children"> {
  trigger: JSXElement
  mount?: HTMLElement
  class?: ComponentProps<"div">["class"]
  classList?: ComponentProps<"div">["classList"]
}

export function HoverCard(props: HoverCardProps) {
  const [local, rest] = splitProps(props, ["trigger", "mount", "class", "classList", "children"])
  const [triggerRef, setTriggerRef] = createSignal<HTMLElement | undefined>()

  return (
    <Kobalte gutter={4} {...rest}>
      <Kobalte.Trigger 
        ref={(el) => { if (el) setTriggerRef(el) }}
        as="div" 
        data-slot="hover-card-trigger"
      >
        {local.trigger}
      </Kobalte.Trigger>
      <Show when={triggerRef()}>
        <Kobalte.Portal mount={local.mount}>
          <Kobalte.Content
            data-component="hover-card-content"
            classList={{
              ...(local.classList ?? {}),
              [local.class ?? ""]: !!local.class,
            }}
          >
            <div data-slot="hover-card-body">{local.children}</div>
          </Kobalte.Content>
        </Kobalte.Portal>
      </Show>
    </Kobalte>
  )
}
