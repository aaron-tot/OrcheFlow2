/**
 * Main entry point for opencode_p3
 * Routes to CLI or Server based on command
 */

// Check if we're being run as CLI or server
const args = process.argv.slice(2);

if (args.includes('serve') || args.includes('--server')) {
  // Start server
  import('./app/server');
} else {
  // Run CLI
  import('./app/cli');
}
