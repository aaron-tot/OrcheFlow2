/**
 * Main entry point for opencode_p3
 * Routes to CLI which handles all commands including 'serve'
 */

console.log('[DEBUG] Starting opencode_p3...');
console.log('[DEBUG] Args:', process.argv);

// Run CLI - it handles all commands including 'serve'
await import('./app/cli').catch(err => {
  console.error('[DEBUG] Failed to import CLI:', err);
  process.exit(1);
});
