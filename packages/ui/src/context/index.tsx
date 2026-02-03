// Context utilities for SolidJS components
import { createContext, useContext, JSX, createSignal, Accessor } from "solid-js"

// Export the helper's createSimpleContext (used by data.tsx, i18n.tsx, etc.)
export { createSimpleContext } from "./helper"

/**
 * Creates a simple context with provider and hook
 * @param defaultValue - The default value for the context
 * @deprecated Use createSimpleContext from helper instead
 */
export function createSimpleContextLegacy<T>(defaultValue: T) {
  const Context = createContext<T>(defaultValue)

  function Provider(props: { value: T; children: JSX.Element }) {
    return (
      <Context.Provider value={props.value}>
        {props.children}
      </Context.Provider>
    )
  }

  function useValue() {
    return useContext(Context)
  }

  return {
    Provider,
    use: useValue,
    Context
  }
}

/**
 * Creates a context that stores a signal
 */
export function createSignalContext<T>(initialValue: T) {
  const [getValue, setValue] = createSignal(initialValue)
  const Context = createContext<[Accessor<T>, (value: T) => void]>([getValue, setValue])

  function Provider(props: { children: JSX.Element }) {
    const [value, setValue] = createSignal(initialValue)
    return (
      <Context.Provider value={[value, setValue]}>
        {props.children}
      </Context.Provider>
    )
  }

  function useValue() {
    return useContext(Context)
  }

  return {
    Provider,
    use: useValue,
    Context
  }
}

// Export DataProvider and related types
export { DataProvider, useData } from "./data"
export type {
  PermissionRespondFn,
  QuestionReplyFn,
  QuestionRejectFn,
  NavigateToSessionFn
} from "./data"

// Export I18nProvider and related
export { I18nProvider, useI18n } from "./i18n"

export default {
  createSimpleContext: createSimpleContextLegacy,
  createSignalContext
}