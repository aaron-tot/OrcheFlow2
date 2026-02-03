# 🤖 AGENTS.MD v2 - OrcheFlow v5 Architecture Rules

**Last Updated:** January 28, 2026  
**Version:** 5.0  
**Purpose:** Strict architecture guidelines for AI agents and human developers

> 💡 **Refactoring Reference:** For effective techniques used to refactor code to AGENTS.md compliance, see [techniquesToRefactorToAgentsMD.md](techniquesToRefactorToAgentsMD.md)

---

## ⚠️ STACK EXEMPTION NOTICE

**CURRENT STACK (Temporary Exemption):**
- **Frontend:** SolidJS (not React 19)
- **Backend:** Hono (not Express)
- **State:** SolidJS Stores (not Zustand)
- **Runtime:** Bun (not Node.js)

**IMPORTANT:** Do NOT convert the tech stack to match the architecture examples below unless explicitly instructed with "also convert the stack to match". References to React/Express/Zustand in this document are architectural patterns only. Apply the same patterns to SolidJS/Hono/Solid Stores.

When user says "make code inline with AGENTS.md", this means:
✅ Apply folder structure rules
✅ Apply file organization rules
✅ Apply naming conventions
✅ Apply size limits
❌ Do NOT convert SolidJS → React
❌ Do NOT convert Hono → Express
❌ Do NOT convert Solid Stores → Zustand

---UICK START

- Run project: `npm run start` or `npm run dev` (both identical)
- Task completion: Must run `npm start`, load URL, check console/terminal for errors
- Architecture validation: `npm run validate` before every commit

### Core Principles
- **The LLM is not a file browser**
- **The LLM is not a search engine**  
- **The LLM is a decision engine**

### Task Audit Requirement
At the end of every task, agents MUST:
1. Reflect on difficulties encountered
2. Provide concise audit explaining struggles
3. Suggest architecture improvements
4. Update AGENTS.MD with approved changes

---

## 📋 TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [File Organization Rules](#file-organization-rules)
3. [API Contract Rules](#api-contract-rules) ⭐ NEW
4. [Component Rules](#component-rules)
5. [State Management Rules](#state-management-rules)
6. [Import/Export Rules](#importexport-rules)
7. [Naming Conventions](#naming-conventions)
8. [Code Size Limits](#code-size-limits)
9. [Debugging & Error Handling](#debugging--error-handling) ⭐ NEW
10. [Git Workflow](#git-workflow)
11. [Token Optimization](#token-optimization)
12. [Code Discoverability](#code-discoverability)
13. [Architecture Validation](#architecture-validation) ⭐ NEW
14. [Forbidden Patterns](#forbidden-patterns)

---

## 🏗️ ARCHITECTURE OVERVIEW

OrcheFlow v4 is a **multi-agent AI orchestration platform** built with:
- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript
- **State:** Zustand + TanStack Query + Apollo GraphQL
- **Desktop:** Tauri (single EXE packaging)
- **Architecture:** Feature-based with Clean Architecture principles

### Core Principles
1. **LLM-First Design** - Optimized for AI agent development
2. **Feature Isolation** - Each feature is self-contained
3. **Predictable Structure** - Files always in expected locations
4. **Token Efficiency** - Keep files small and focused
5. **Single Source of Truth** - No duplicate logic or state

---

## 📁 FILE ORGANIZATION RULES

### ✅ REQUIRED Structure

```
src/
├── app/                    # Application level
│   ├── App.tsx            # Root component
│   ├── main.tsx           # Entry point
│   ├── layout/            # Layout components
│   ├── pages/             # Page components
│   └── styles/            # Global styles
├── features/              # Feature modules (CORE)
│   └── [feature]/
│       ├── components/    # UI components (max 200 lines each)
│       ├── hooks/         # Feature hooks (max 100 lines each)
│       ├── stores/        # State management (max 400 lines each)
│       ├── services/      # Business logic (use cases)
│       ├── domain/        # Domain interfaces & models
│       ├── infrastructure/# Repository implementations
│       ├── types.ts       # Feature types
│       └── index.ts       # Public API (barrel export)
├── shared/                # Reusable across features
│   ├── ui/                # UI components
│   ├── hooks/             # Shared hooks
│   ├── types/             # Global types
│   │   └── api/          # Shared API types (frontend/backend)
│   ├── utils/             # Utility functions
│   └── constants/         # App constants
├── infrastructure/        # External integrations
│   ├── api/               # API clients
│   ├── storage/           # Persistence
│   └── mcp/              # MCP servers
└── external-data/         # Large data files (excluded from LLM context)

backend/
├── src/
│   ├── app/              # Backend application (server.ts)
│   ├── features/         # Backend feature modules
│   │   └── [feature]/
│   │       ├── routes/   # HTTP routes (ONE file per feature)
│   │       ├── services/ # Business logic
│   │       ├── domain/   # Domain models
│   │       └── infrastructure/ # Persistence
│   ├── core/             # Core domain logic
│   └── shared/           # Backend utilities
└── config/               # Config files (tools.json, agents.json)
```

### 🚫 FORBIDDEN Patterns

```
❌ src/components/          # Use features/[feature]/components/
❌ src/utils/common/        # Use shared/utils/
❌ src/helpers/             # Use shared/utils/ or services/
❌ src/lib/                 # Use shared/
❌ src/stores/              # Use features/[feature]/stores/
❌ src/services/            # Use features/[feature]/services/
❌ src/memory/              # Use features/memory/
❌ backend/routes/          # Use backend/src/features/[feature]/routes/
❌ backend/controllers/     # Use backend/src/features/[feature]/routes/
❌ Deep nesting > 4 levels  # Max: features/[feature]/components/
```

---

## 🔌 API CONTRACT RULES

### ✅ REQUIRED: Single Source of Truth for APIs

#### 1. One Router Per Feature

```
backend/src/features/[feature]/routes/
└── [feature]Routes.ts  ← ONLY router file per feature
```

**Rules:**
- ONE router file per feature
- NO duplicate routers (e.g., toolRoutes.ts AND ToolRoutes.ts)
- Router MUST be mounted in `backend/src/app/server.ts`
- Router MUST be exported as `[feature]Router`

**Example:**
```typescript
// backend/src/features/tools/routes/toolRoutes.ts
import express from 'express'

export const toolRouter = express.Router()

// Standard REST endpoints
toolRouter.get('/', async (req, res) => { /* List all */ })
toolRouter.get('/:id', async (req, res) => { /* Get one */ })
toolRouter.post('/', async (req, res) => { /* Create */ })
toolRouter.put('/:id', async (req, res) => { /* Update */ })
toolRouter.delete('/:id', async (req, res) => { /* Delete */ })
```

#### 2. Router Must Be Mounted

```typescript
// backend/src/app/server.ts
import { toolRouter } from '../features/tools/routes/toolRoutes.js'
import { agentRouter } from '../features/agents/routes/agentRoutes.js'

app.use('/api/tools', toolRouter)     // ✅ Mounted
app.use('/api/agents', agentRouter)   // ✅ Mounted
```

### ✅ REQUIRED: API Endpoint Conventions

| HTTP Method | Pattern | Purpose |
|------------|---------|---------|
| GET | `/api/[feature]` | List all items |
| GET | `/api/[feature]/:id` | Get single item |
| POST | `/api/[feature]` | Create new item |
| PUT | `/api/[feature]/:id` | Update full item |
| PATCH | `/api/[feature]/:id` | Update partial item |
| DELETE | `/api/[feature]/:id` | Delete item |
| PUT | `/api/[feature]/:id/[action]` | Special actions (e.g., /status) |

**Forbidden Non-Standard Endpoints:**
```typescript
❌ GET /api/tools/list        // Use GET /api/tools
❌ POST /api/tools/create     // Use POST /api/tools
❌ PUT /api/tools/:id/update  // Use PUT /api/tools/:id
❌ GET /api/tools/getAll      // Use GET /api/tools
```

### ✅ REQUIRED: API Response Format

ALL API responses MUST follow this structure:

```typescript
// Success response
interface SuccessResponse<T = any> {
  success: true
  data?: T              // Optional: response data
  message?: string      // Optional: success message
}

// Error response
interface ErrorResponse {
  success: false
  error: string         // Required: error message
  code?: string         // Optional: error code (e.g., 'TOOL_NOT_FOUND')
}

// Implementation
router.get('/:id', async (req, res) => {
  try {
    const item = await service.getById(req.params.id)
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found',
        code: 'TOOL_NOT_FOUND'
      })
    }
    res.json({
      success: true,
      data: item
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})
```

**Forbidden Response Patterns:**
```typescript
❌ return { tools: [...] }              // Missing success flag
❌ return { ok: true, result: [...] }   // Non-standard keys
❌ throw error without try/catch        // Must return JSON
❌ return { status: 'success' }         // Use 'success' boolean
```

### ✅ REQUIRED: Shared Types Between Frontend/Backend

```typescript
// shared/types/api/ToolAPI.ts
export interface UpdateToolRequest {
  name?: string
  description?: string
  enabled?: boolean
}

export interface UpdateToolResponse {
  success: boolean
  message?: string
  error?: string
}

export interface Tool {
  id: string
  name: string
  description: string
  enabled: boolean
  category: string
  riskLevel: string
}

// Backend uses same types
import { UpdateToolRequest, Tool } from '../../../shared/types/api/ToolAPI.js'

// Frontend uses same types
import { UpdateToolRequest, Tool } from '@shared/types/api/ToolAPI'
```

---

## 🧩 COMPONENT RULES

### ✅ REQUIRED Component Structure

```typescript
/**
 * Component: [Name]
 * Purpose: [One sentence description]
 * 
 * @example
 * <ComponentName prop1="value" />
 */
import React from 'react'
import { /* specific imports */ } from '@shared/ui'

interface ComponentNameProps {
  // Props with JSDoc
  /** Description */
  prop1: string
}

export const ComponentName: React.FC<ComponentNameProps> = ({ prop1 }) => {
  // 1. Hooks
  const state = useHook()
  
  // 2. Derived state / Memoization
  const computed = useMemo(() => {}, [deps])
  
  // 3. Event handlers
  const handleClick = useCallback(() => {}, [deps])
  
  // 4. Effects (if necessary)
  useEffect(() => {}, [deps])
  
  // 5. Render
  return (
    <div>
      {/* JSX */}
    </div>
  )
}
```

### 🚫 Component Anti-Patterns

```typescript
❌ export default Component        // Use named exports
❌ Component with > 200 lines       // Split into sub-components
❌ Multiple components per file     // One component per file
❌ Inline styles                    // Use Tailwind classes
❌ Business logic in components     // Extract to hooks/services
```

---

## 🔄 STATE MANAGEMENT RULES

### ✅ REQUIRED Store Structure

```typescript
/**
 * Store: [Feature] State Management
 * Purpose: [Description]
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface State {
  // State properties with JSDoc
  /** Description */
  items: Record<string, Item>
}

interface Actions {
  // Action methods with JSDoc
  /** Description */
  addItem: (item: Item) => void
}

export const useFeatureStore = create<State & Actions>()(
  devtools(
    persist(
      immer((set) => ({
        // Initial state
        items: {},
        
        // Actions
        addItem: (item) => set((state) => {
          state.items[item.id] = item
        })
      })),
      { name: 'feature-store' }
    )
  )
)
```

### 🎯 Store Selection Rules

```typescript
✅ GOOD: Specific selectors
const theme = useUIStore(state => state.theme)
const pipeline = usePipelineStore(state => state.pipelines[id])

❌ BAD: Whole store
const store = useUIStore()  // Re-renders on ANY state change
```

### 📊 When to Use Each State Layer

| State Type | Use When | Tool |
|------------|----------|------|
| UI State | Theme, panels, local UI | Zustand |
| Server Data | REST API fetching | TanStack Query |
| Real-time | WebSocket, live updates | Apollo GraphQL |
| Form State | Complex forms | react-hook-form |

---

## 📦 IMPORT/EXPORT RULES

### ✅ REQUIRED Import Patterns

```typescript
// 1. External dependencies (React first)
import React, { useState, useEffect } from 'react'
import { Button } from '@shared/ui'

// 2. Features (use public API)
import { usePipeline, Pipeline } from '@features/pipelines'

// 3. Shared utilities
import { debug } from '@shared/utils/debug'

// 4. Types
import type { AgentType } from '@shared/types'

// 5. Relative imports (only within same feature)
import { SubComponent } from './SubComponent'
```

### ✅ REQUIRED Export Patterns

```typescript
// features/[feature]/index.ts - MUST exist for every feature
export * from './components'
export * from './hooks'
export * from './stores'
export * from './types'

// Named exports only
export { Component } from './Component'
export type { ComponentProps } from './Component'
```

### 🚫 FORBIDDEN Import Patterns

```typescript
❌ import from '../../../shared/ui/Button'  // Use @shared/ui
❌ import from 'features/tools/stores/ToolStore'  // Use @features/tools
❌ import * as Tools from '@features/tools'  // Import specific items
❌ export default Component  // Use named exports
```

---

## 📝 NAMING CONVENTIONS

### ✅ REQUIRED Naming Standards

| Item | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `ChatInterface.tsx` |
| Hooks | camelCase with `use` | `useChatState.ts` |
| Stores | camelCase with `use` + `Store` | `usePipelineStore.ts` |
| Services | PascalCase + `Service` | `ToolService.ts` |
| Routers | camelCase + `Router` | `toolRouter`, `agentRouter` |
| Types | PascalCase | `Pipeline`, `Agent` |
| Interfaces | PascalCase (no `I` prefix) | `ProviderConfig` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Folders | kebab-case | `agent-management/` |
| Files (utils) | camelCase | `formatDate.ts` |

### 🚫 FORBIDDEN Naming

```
❌ Iinterface, IProvider         # No "I" prefix
❌ utils.ts, helpers.ts          # Be specific
❌ temp.tsx, old.tsx             # Delete, don't keep
❌ MyComponent, my_component     # Use consistent case
❌ toolroutes.ts, ToolRoutes.ts  # Use toolRoutes.ts (camelCase)
```

---

## 📏 CODE SIZE LIMITS

### ✅ STRICT LIMITS (Must not exceed)

| File Type | Max Lines | Max Tokens | Action if Exceeded |
|-----------|-----------|------------|-------------------|
| Component | 200 | 2,000 | Split into sub-components |
| Hook | 100 | 1,000 | Extract business logic |
| Store | 400 | 4,000 | Split by domain |
| Service | 300 | 3,000 | Split by responsibility |
| Page | 150 | 1,500 | Compose from components |

---

## 🐛 DEBUGGING & ERROR HANDLING

### ✅ REQUIRED: Error Message Standards

All error messages MUST include:
1. Feature name in brackets: `[ToolStore]`, `[ToolRoutes]`
2. Action attempted: `Failed to update tool`
3. Specific error: Original error message

```typescript
// ✅ CORRECT
throw new Error(`[ToolStore] Failed to update tool ${id}: ${error.message}`)

// ❌ FORBIDDEN
throw new Error('Update failed')
throw new Error(error.message)  // Missing context
```

### ✅ REQUIRED: Logger Consistency

```typescript
// shared/utils/debug.ts MUST export ONLY these methods:
interface Logger {
  info: (message: string, ...args: any[]) => void
  warn: (message: string, ...args: any[]) => void
  error: (message: string, ...args: any[]) => void
}

// ✅ CORRECT Usage
debug.info('[ToolStore] Loading tools from backend')
debug.warn('[ToolStore] Tool not found:', toolId)
debug.error('[ToolStore] Failed to load:', error)

// ❌ FORBIDDEN
debug.success('Done')      // Method doesn't exist
debug.log('Message')       // Use info() instead
console.log('Debug')       // Use debug utility
logger.success('Done')     // Method doesn't exist
```

### ✅ REQUIRED: Console Logging Standards

```typescript
// Backend logs
✅ debug.info('[ToolRoutes] Updating tool:', { toolId, updates })
✅ debug.error('[ToolRoutes] Update failed:', error)

// Frontend logs
✅ debug.info('[ToolStore] Fetching tools from backend')
✅ debug.error('[ToolStore] Failed to fetch:', error)

// FORBIDDEN:
❌ console.log('updating...')           // Use debug utility
❌ console.log(`\x1b[36m[...]\x1b[0m`) // Use debug utility
❌ logger.success('Done')               // Method doesn't exist
❌ debug.success('Done')                // Method doesn't exist
```

### ✅ ALLOWED: Per-File Debug Flags

```typescript
// Top of file (TEMPORARY - don't commit as true)
const DEBUG_FILE = false  // Set to true for debugging

// Usage
if (DEBUG_FILE) {
  debug.info('[ToolStore] Debug info:', data)
}
```

**When to use:**
- Debugging specific file behavior
- Tracing execution flow
- Temporary verbose logging

**Rules:**
- MUST be `false` when committed
- Use feature-scoped naming: `DEBUG_[FEATURE]`
- Remove before production

---

## 🚨 COMMON PITFALLS & SOLUTIONS

### ❌ Cache Timing Issues

**Problem:** Caching data before it's fully populated

```typescript
// ❌ WRONG - Cache set BEFORE data is ready
cachedProviders = providers
providers.push(ollamaLocal)

// ✅ CORRECT - Cache set AFTER data is complete
providers.push(ollamaLocal)
cachedProviders = providers
```

### ❌ Async/Await Propagation

**Problem:** Making function async but not awaiting the call

```typescript
// ❌ WRONG - Made provider() async but didn't await
const providerPrompts = SystemPrompt.provider(input.model)

// ✅ CORRECT - Await the async function
const providerPrompts = await SystemPrompt.provider(input.model)
```

**Rule:** If you make a function `async`, ALL call sites must `await` it

### ❌ Windows Path Handling

**Problem:** Backslashes vs forward slashes in paths

```typescript
// ❌ WRONG - Mixing path separators
const filePath = 'C:\\Users\\' + username + '/Desktop'

// ✅ CORRECT - Use path.join()
const filePath = path.join('C:', 'Users', username, 'Desktop')

// ✅ CORRECT - Normalize paths
const normalized = path.normalize(userPath)
```

### ❌ Line Ending Normalization

**Problem:** Windows \r\n vs Unix \n in JSON/text files

```typescript
// ❌ WRONG - Raw JSON.stringify on Windows
await fs.writeFile(file, JSON.stringify(data, null, 2))

// ✅ CORRECT - Normalize line endings
function prettyJSON(data: any): string {
  return JSON.stringify(data, (key, value) => {
    if (typeof value === 'string') {
      return value.replace(/\r\n/g, '\n')
    }
    return value
  }, 2)
}
await fs.writeFile(file, prettyJSON(data))
```

### ❌ Permission Check Failures

**Problem:** Working directory "/" when no git repo causes external path blocks

```typescript
// ❌ WRONG - external_directory set to "ask" with no approval flow
external_directory: { "*": "ask" }

// ✅ CORRECT - Allow external paths for local development
external_directory: { "*": "allow" }
```

**Context:** When `Instance.worktree = "/"`, `Instance.containsPath()` returns false for all paths, blocking external directory access.

### ❌ Model Capability Assumptions

**Problem:** Expecting all models to follow complex system prompts

```typescript
// ❌ WRONG - Assuming smaller models follow detailed instructions
// qwen3:8b may ignore "YOU MUST use tools" instructions

// ✅ CORRECT - Test with capable models first
// Use GPT-4, Claude, or larger models for complex prompts
// Then simplify for smaller models
```

---

## 🌿 GIT WORKFLOW

### ✅ REQUIRED Branch Strategy

```
main                    # Production-ready code ONLY
  └── devMerge         # Integration branch
        └── feature/*   # Feature branches
```

### 📋 Branch Rules

1. **NEVER merge directly to `main`**
2. **ALWAYS create features from `main`**
3. **ALWAYS merge features to `devMerge` first**
4. **Fix all bugs in `devMerge` before merging to `main`**
5. **Only merge `devMerge` to `main` when production-ready**

### ✅ Commit Message Format

```bash
# Format: <type>(<scope>): <description>

feat(tools): add MCP server integration
fix(chat): resolve message duplication bug
refactor(pipelines): split PipelineView component
docs(architecture): update AGENTS.md
chore(deps): update dependencies
```

---

## ⚡ TOKEN OPTIMIZATION

### ✅ REQUIRED Optimizations

#### 1. File Size Management
```typescript
✅ Keep components under 200 lines
✅ Extract hooks from large components
✅ Split monolithic files immediately
```

#### 2. Data File Management
```bash
✅ Move large JSON files to external-data/
✅ Lazy load model data (don't import inline)
✅ Use dynamic imports for large datasets
```

#### 3. Exclusion Rules (`.llmignore`)
```bash
# Required .llmignore contents:
package-lock.json
**/package-lock.json
**/node_modules/**
*.png
*.jpg
*.jpeg
external-data/
docs/**/*.md
tests/**/*.png
**/*.old.*
**/*.backup.*
```

---

## 🎯 CODE DISCOVERABILITY

### 🗺️ CRITICAL FILE LOCATIONS

When debugging or modifying core behavior, these files are your entry points:

| Task | File Path | Purpose |
|------|-----------|---------|
| Add/mount router | `backend/src/app/server.ts` or `backend/src/app/routes.ts` | All feature routers mounted here |
| Debug logging utility | `shared/utils/debug.ts` | ONLY methods: `info()`, `warn()`, `error()` |
| Agent permissions | `backend/src/features/agents/services/AgentExecutor.ts` | Permission config per agent type |
| System prompts | `backend/src/features/agents/infrastructure/prompt/*.txt` | All system prompt files |
| Prompt selection logic | `backend/src/features/agents/infrastructure/system.ts` | `provider()`, `listPrompts()`, `setSelectedPrompt()` |
| LLM streaming | `backend/src/features/agents/infrastructure/llm.ts` | Request/response handling, logging |
| Storage paths | `backend/src/core/storage/global.ts` or `shared/utils/global.ts` | `Global.Path.data` location |
| Model provider data | `backend/src/features/providers/services/models.ts` | Model loading, caching |
| Ollama integration | `backend/src/features/ollama/routes/ollamaRoutes.ts` | Ollama-specific endpoints |
| Instance/workspace | `backend/src/core/instance/index.ts` | `Instance.worktree`, `Instance.project` |

### ✅ REQUIRED Repository Interfaces

All domain repositories MUST be defined as interfaces:

```
src/features/
├── agents/domain/AgentRepository.ts          ✅ Created
├── pipelines/domain/PipelineRepository.ts    ✅ Created
├── tools/domain/ToolRepository.ts            ✅ Created
└── memory/domain/MemoryRepository.ts         ✅ Created
```

### 📋 Feature Completeness Checklist

Before considering a feature "complete", verify:

```
✅ Single router file in backend/src/features/[feature]/routes/
✅ Router mounted in backend/src/app/server.ts
✅ Shared types in shared/types/api/[Feature]API.ts
✅ Frontend store imports shared types
✅ Backend routes import shared types
✅ All CRUD endpoints follow REST conventions
✅ No duplicate route definitions
✅ No orphaned files (.old, .backup)
✅ Feature has index.ts barrel export
✅ All components < 200 lines
✅ All hooks < 100 lines
✅ All stores < 400 lines
✅ No console.log() statements (use debug utility)
✅ No logger.success() calls (use debug.info())
✅ Proper JSDoc on all public functions
```

---

## ✅ ARCHITECTURE VALIDATION

### Pre-Commit Validation

Run BEFORE every commit:

```bash
npm run validate  # Runs architecture validator
```

**Script Location:** `scripts/validate-architecture.ts` (or similar)

### Validation Checks Performed

The validator checks for:
- ✅ No duplicate router files (e.g., `toolRoutes.ts` AND `ToolRoutes.ts`)
- ✅ No orphaned files (`.old`, `.backup`, `.temp`)
- ✅ No invalid logger methods (`logger.success()`, `debug.success()`)
- ✅ All routers mounted in `server.ts` or `routes.ts`
- ✅ No non-standard API responses (`ok:` instead of `success:`)
- ✅ No forbidden directory structures (`src/components/`, `src/utils/`)
- ✅ File size limits respected (components < 200 lines, etc.)
- ✅ No `console.log()` statements (use `debug` utility)

### Adding New Validation Rules

To add custom checks, edit the validation script:

```typescript
// scripts/validate-architecture.ts
export function validateCustomRule() {
  // Your validation logic
  const violations = findViolations()
  if (violations.length > 0) {
    console.error('❌ Custom rule violated:', violations)
    process.exit(1)
  }
}
```

### Manual Validation Commands

```bash
# Check for duplicate routers
find backend/src/features -name "*Routes.ts" -o -name "*routes.ts"

# Check for orphaned files
find src backend -name "*.old.*" -o -name "*.backup.*"

# Check for invalid logger methods
grep -r "logger\.success\|debug\.success" src/ backend/

# Check for non-standard API responses
grep -r "res\.json.*ok:" backend/src

# Check for console.log (should use debug utility)
grep -r "console\.log" src/ backend/ --exclude="*.test.ts"
```

---

## 🚫 FORBIDDEN PATTERNS

### ❌ Architecture Violations

```typescript
// 1. DON'T have duplicate routers
❌ backend/src/features/tools/routes/toolRoutes.ts
❌ backend/src/features/tools/interfaces/ToolRoutes.ts
✅ backend/src/features/tools/routes/toolRoutes.ts (ONE ONLY)

// 2. DON'T use direct store dependencies in domain services
❌ class ExecuteTool {
  constructor(private toolStore: ReturnType<typeof useToolStore>) {}
}
✅ class ExecuteTool {
  constructor(
    private toolRepo: ToolRepository,
    private permissionService: PermissionService
  ) {}
}

// 3. DON'T keep .old or .backup files
❌ ToolManagementPage.old.tsx    # Delete immediately
❌ component.backup.tsx          # Delete immediately

// 4. DON'T have non-standard API endpoints
❌ GET /api/tools/list        // Use GET /api/tools
❌ POST /api/tools/create     // Use POST /api/tools
```

### ❌ Code Quality Violations

```typescript
// 1. NO default exports
❌ export default Component
✅ export { Component }

// 2. NO any types
❌ parameters: Record<string, any>
✅ parameters: Record<string, unknown>

// 3. NO console.log
❌ console.log('debug')
✅ debug.info('message')

// 4. NO logger.success()
❌ logger.success('Done')
✅ debug.info('Success: Done')

// 5. NO magic numbers
❌ if (items.length > 50) { }
✅ const MAX_ITEMS = 50
   if (items.length > MAX_ITEMS) { }
```

---

## 🎯 QUICK REFERENCE

### Before Creating Any File, Ask:

1. ✅ **Location**: Is this in the correct feature folder?
2. ✅ **Size**: Will this file be < 200 lines?
3. ✅ **Naming**: Does it follow naming conventions?
4. ✅ **Purpose**: Does it have a single, clear responsibility?
5. ✅ **Exports**: Will it export through a barrel file?

### Before Committing Code, Check:

1. ✅ Run `npm run validate`
2. ✅ No console.log statements
3. ✅ No logger.success() calls
4. ✅ No commented-out code
5. ✅ All imports used
6. ✅ TypeScript errors resolved
7. ✅ File size limits respected
8. ✅ Proper JSDoc comments
9. ✅ No .old or .backup files

---

## 🔧 TOOLING REQUIREMENTS

### Required Files in Root

```
✅ .llmignore           # LLM context exclusions
✅ tsconfig.json        # TypeScript config with path aliases
✅ .eslintrc.js         # ESLint rules
✅ .prettierrc          # Code formatting
✅ AGENTSV2.md          # This file
✅ token-calculator.js  # Token usage analyzer
```

### Required Path Aliases (tsconfig.json)

```json
{
  "compilerOptions": {
    "paths": {
      "@app/*": ["./src/app/*"],
      "@features/*": ["./src/features/*"],
      "@shared/*": ["./src/shared/*"],
      "@infrastructure/*": ["./src/infrastructure/*"]
    }
  }
}
```

---

## 📞 QUESTIONS?

If you encounter a situation not covered by these rules:

1. Look for similar examples in the codebase
2. Follow the principle of least surprise
3. Prioritize maintainability over cleverness
4. Ask before creating new patterns
5. Propose updates to this document

---

**THESE RULES ARE MANDATORY. NO EXCEPTIONS.**

Violations of these rules will result in:
- Code review rejections
- Required refactoring
- Blocked merges to devMerge/main
- Failed architecture validation

**When in doubt, follow these rules strictly.**
