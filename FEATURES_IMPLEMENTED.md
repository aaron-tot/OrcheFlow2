# Features Implemented from v4 to v5

This document tracks features ported from v4/devMerge to v5/opencode-fresh.

## ✅ Feature 1: Input History Cycling (Up/Down Arrows)

**Status**: Already Implemented in v5 ✅

**Location**: `packages/solidJS/src/components/prompt-input.tsx`

**Functionality**:
- Press **Arrow Up** to cycle backwards through previous prompts
- Press **Arrow Down** to cycle forward through prompt history
- Maintains separate history for normal mode and shell mode (`!` prefix)
- Stores up to 100 entries (MAX_HISTORY constant)
- Persists history across sessions using `persisted()` store
- Smart cursor positioning when navigating history

**Implementation Details**:
- History state: Lines 238-272 (`historyIndex`, `savedPrompt`, `history.entries`, `shellHistory.entries`)
- Navigation logic: Lines 948-988 (`navigateHistory()` function)
- Keyboard handling: Lines 1081-1113 (ArrowUp/ArrowDown detection)
- Storage keys:
  - `prompt-history.v1` for normal mode
  - `prompt-history-shell.v1` for shell mode

**User Experience**:
- Works like terminal history (bash/zsh style)
- Only activates when cursor is at start/end of input or input is empty
- Saves current input when entering history mode
- Restores saved input when navigating back to "present"

---

## ✅ Feature 2: Chat Navigation Buttons (4 Arrow Buttons)

**Status**: Newly Implemented ✅

**New File Created**: `packages/solidJS/src/components/chat-navigation.tsx`

**Modified File**: `packages/solidJS/src/pages/session.tsx` (lines 21, 2051-2053)

**Functionality**:
Four floating buttons on the right side of the chat:
1. **Double Chevron Up** - Jump to top of conversation
2. **Single Chevron Up** - Jump to previous user message
3. **Single Chevron Down** - Jump to next user message
4. **Double Chevron Down** - Jump to bottom of conversation

**Visual Design**:
- Fixed position: `right-4 bottom-20`
- Semi-transparent by default (30% opacity)
- Full opacity on hover (smooth transition)
- Backdrop blur effect for better readability
- Border and rounded corners matching OpenCode design system
- Z-index 40 to stay above content but below modals

**Implementation Details**:
- Uses `data-message-id` attributes to find messages
- Detects user messages vs assistant messages
- Smooth scroll behavior with `behavior: "smooth"`
- Smart positioning: scrolls to 50px before message for better context
- Only shows when messages exist (`renderedUserMessages().length > 0`)

**Icon Usage**:
- `chevron-grabber-vertical` for double chevrons (jump to top/bottom)
- `chevron-grabber-vertical` with `rotate-180` for upward double chevron
- `chevron-down` for single down arrow
- `chevron-down` with `rotate-180` for single up arrow

**Integration Points**:
- Component receives `containerRef` (the scrollable div with messages)
- Wraps in `<Show>` to only render when there are messages
- Uses existing `scroller` ref from session.tsx

---

## Testing Checklist

### Input History
- [ ] Type a message and send it
- [ ] Type a new message
- [ ] Press Arrow Up - should show previous message
- [ ] Press Arrow Up again - should go further back (if multiple messages exist)
- [ ] Press Arrow Down - should go forward in history
- [ ] Press Arrow Down when at newest - should restore current typed message
- [ ] Try in shell mode (`!` prefix) - should have separate history

### Chat Navigation
- [ ] Scroll to middle of a long conversation
- [ ] Click "Previous message" button - should jump to previous user prompt
- [ ] Click "Next message" button - should jump to next user prompt
- [ ] Click "Jump to top" - should scroll to very beginning
- [ ] Click "Jump to bottom" - should scroll to end of conversation
- [ ] Verify buttons are semi-transparent when not hovered
- [ ] Verify buttons become fully visible on hover
- [ ] Verify buttons only appear when messages exist

---

## Architecture Notes

### Why Input History Was Already Implemented
v5 (opencode-fresh) is more mature than v4 and already had this feature built in with:
- Better persistence (uses global persisted store)
- Mode-aware history (normal vs shell)
- Smart activation logic
- Better UX (saves current input when entering history)

### Why Chat Navigation Needed Implementation
v4's approach used:
- React hooks and refs
- Different class naming conventions
- Lucide icons directly

v5 needed:
- SolidJS reactive primitives (signals, stores)
- OpenCode design system (Icon component, Tooltip)
- Integration with existing scroll management (autoScroll hook)
- Different HTML structure (SessionTurn components)

### Design Decisions
1. **Component Isolation**: Created standalone `chat-navigation.tsx` for reusability
2. **Conditional Rendering**: Only show when messages exist to avoid empty state clutter
3. **Icon Workaround**: Used CSS transforms (`rotate-180`) since Icon component doesn't have all arrow variants
4. **Positioning**: Fixed position instead of absolute to ensure it's always visible during scroll
5. **Z-Index Management**: Set to 40 (below dialogs at 50, above content)

---

## Files Changed

### Created
- `packages/solidJS/src/components/chat-navigation.tsx` (142 lines)

### Modified
- `packages/solidJS/src/pages/session.tsx`:
  - Line 21: Added import for ChatNavigation
  - Lines 2051-2053: Added ChatNavigation component in JSX

### Total Impact
- **Lines Added**: ~145
- **Lines Modified**: 2
- **New Dependencies**: None (uses existing @opencode-ai/ui components)
- **Breaking Changes**: None

---

## Future Enhancements

### Input History
- [ ] Add visual indicator when in history mode
- [ ] Add keyboard shortcut to clear history
- [ ] Export/import history for backup
- [ ] Search within history

### Chat Navigation
- [ ] Highlight target message briefly after navigation
- [ ] Add keyboard shortcuts (e.g., Alt+Up/Down for message navigation)
- [ ] Show progress indicator (e.g., "Message 5 of 23")
- [ ] Add "jump to specific message" dialog
- [ ] Remember last scroll position per session

---

## References

### v4 Implementation (Reference Only)
- Input History UI: `v4/branches/devMerge/src/app/pages/PromptInput.tsx` (lines 64-84)
- Chat Navigation: `v4/branches/devMerge/src/features/chat/components/ChatNavigation.tsx`
- Message List Integration: `v4/branches/devMerge/src/app/pages/MessageList.tsx` (lines 238-280)

### v5 Implementation (Active)
- Input History Logic: `packages/solidJS/src/components/prompt-input.tsx` (lines 238-272, 948-988, 1081-1113)
- Chat Navigation: `packages/solidJS/src/components/chat-navigation.tsx`
- Integration: `packages/solidJS/src/pages/session.tsx`
