/**
 * Custom Provider Loaders
 * Re-exports all provider loaders from specialized modules
 */
import type { CustomLoader } from "../domain/Provider"
import { aiServiceLoaders } from "./ProviderLoadersAI"
import { cloudLoaders } from "./ProviderLoadersCloud"
import { localLoaders } from "./ProviderLoadersLocal"

// Combine all loaders into a single export
export const CUSTOM_LOADERS: Record<string, CustomLoader> = {
  ...aiServiceLoaders,
  ...cloudLoaders,
  ...localLoaders,
}
