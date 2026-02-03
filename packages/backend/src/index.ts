/**
 * Backend Server Entry Point
 * Starts the Hono HTTP/WebSocket server
 */
import { Server } from './app/server'
import { Provider } from './features/providers/services/provider'

const port = process.env.PORT ? parseInt(process.env.PORT) : 4003
const hostname = process.env.HOST || '127.0.0.1'

console.log(`[Backend] Starting server on ${hostname}:${port}...`)

// Refresh Ollama models on startup (if Ollama is configured)
Provider.refreshOllamaModels().catch(() => {
  // Silently ignore if Ollama is not available
})

// Auto-refresh Ollama models every 30 seconds
const ollamaRefreshInterval = setInterval(() => {
  Provider.refreshOllamaModels().catch(() => {
    // Silently ignore if Ollama is not available
  })
}, 30000)

const server = Server.listen({
  port,
  hostname,
  mdns: false,
  cors: []
})

// Graceful shutdown handlers
let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  
  console.log(`\n[Backend] Received ${signal}, shutting down gracefully...`)
  
  // Clear refresh interval
  clearInterval(ollamaRefreshInterval)
  
  try {
    await server.stop(true)
    console.log('[Backend] Server stopped successfully')
    process.exit(0)
  } catch (error) {
    console.error('[Backend] Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

