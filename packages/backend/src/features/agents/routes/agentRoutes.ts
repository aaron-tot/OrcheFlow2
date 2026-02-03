/**
 * Agent Routes
 * Purpose: Main router setup and barrel export for all agent routes
 */
import { Hono } from "hono"
import { lazy } from "../../../shared/utils/lazy"
import { addCrudRoutes } from "./agent-crud"
import { addActionRoutes } from "./agent-actions"
import { addStreamRoutes } from "./agent-stream"

/**
 * SessionRoutes - Main router for agent/session endpoints
 * 
 * Combines CRUD, action, and streaming routes into a single router
 */
export const SessionRoutes = lazy(() => {
  const app = new Hono()
  
  // Add CRUD routes (GET, POST, PUT, PATCH, DELETE)
  addCrudRoutes(app)
  
  // Add action routes (init, fork, abort, share, summarize, revert, etc.)
  addActionRoutes(app)
  
  // Add streaming routes (prompt, command, shell)
  addStreamRoutes(app)
  
  return app
})


