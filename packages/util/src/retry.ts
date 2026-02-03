/**
 * Retry Utility
 * Provides retry functionality with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number
  delay?: number
  backoffFactor?: number
  maxDelay?: number
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoffFactor = 2,
    maxDelay = 10000
  } = options

  let lastError: Error | undefined
  let currentDelay = delay

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt === maxAttempts) {
        throw lastError
      }

      await new Promise(resolve => setTimeout(resolve, currentDelay))
      currentDelay = Math.min(currentDelay * backoffFactor, maxDelay)
    }
  }

  throw lastError
}