/**
 * CLI Entry Point
 * Runs the command-line interface with yargs
 */
console.log('[CLI] Starting OpenCode CLI...')
console.log('[CLI] Args:', process.argv)

// Import and run CLI
await import('./app/cli').catch(err => {
  console.error('[CLI] Failed to import CLI:', err)
  process.exit(1)
})
