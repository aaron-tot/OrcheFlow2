# OpenCode Fresh Setup - Notes

## Setup Summary

This is a fresh clone of OpenCode from the official repository (dev branch) with your custom `opencode_P3` package preserved.

## Directory Structure

- **Active Package**: `packages/opencode` (official OpenCode core)
- **Custom Package**: `packages/opencode_P3` (your custom modifications - preserved for reference)

## Current Configuration

The project is configured to use the **official opencode package** by default:
- Root `package.json` dev script points to: `packages/opencode`
- All dependencies installed and working
- Application tested and running successfully

## How to Run

```bash
# Start OpenCode TUI (Terminal User Interface)
bun run dev

# Or from package directory
cd packages/opencode
bun run --conditions=browser src/index.ts
```

## About opencode_P3

Your custom `opencode_P3` package is preserved in `packages/opencode_P3/` but is **not currently active** because:
- It has a completely different architecture (app/core/features/infrastructure structure)
- Missing some module dependencies expected by the OpenCode ecosystem
- Uses a different organizational pattern than the official package

### opencode_P3 Structure
```
packages/opencode_P3/src/
├── app/
├── core/
├── features/
├── infrastructure/
└── shared/
```

### Official opencode Structure
```
packages/opencode/src/
├── agent/
├── cli/
├── mcp/
├── provider/
├── tool/
└── (30+ other directories)
```

## Next Steps (Optional)

If you want to integrate specific features from `opencode_P3`:

1. **Identify the features** you want to port from P3
2. **Locate equivalent locations** in the official opencode structure
3. **Manually merge** the specific code/features
4. **Test incrementally** after each merge

## Original Broken Directory

The old broken installation is still at:
```
v5/branches/main/
```

You can delete this once you confirm the fresh setup meets your needs.

## Status

✅ Fresh OpenCode clone working
✅ Custom opencode_P3 package preserved
✅ Dependencies installed
✅ Application tested and running
✅ Ready to use

---

**Date Created**: January 30, 2026
**Source**: https://github.com/anomalyco/opencode (dev branch)
