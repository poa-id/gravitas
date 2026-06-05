# Gravitas QA

Read `gravitas-context.md` first. This file focuses on quality assurance.

## Testing Philosophy

1. **Unit tests** for pure logic (no DOM, no Tauri) — use Vitest
2. **Manual QA** flows for editor feel and file system behavior
3. **No E2E tests** — Tauri makes this hard; manual covers it at this scale

## Setting Up Vitest

```bash
npm install -D vitest
```

Add to `vite.config.ts`:
```ts
/// <reference types="vitest" />
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

## What to Unit Test (Pure Logic)

### `workshop/noteCreation.ts`
```ts
titleToFilename('Hello World')         // → 'hello-world'
titleToFilename('My Note #1!')         // → 'my-note-1'
titleToFilename('   spaces   ')        // → 'spaces'
titleToFilename('')                    // → 'untitled'
titleToFilename('a'.repeat(100))       // → 60 chars max
titleToFilename('---')                 // → 'untitled'

extractTitle('# Hello')               // → 'Hello'
extractTitle('## Sub heading')         // → 'Sub heading'
extractTitle('Plain first line')       // → 'Plain first line'
extractTitle('')                       // → 'untitled'
```

### `editor/Editor.tsx` (countWords, readingTime)
```ts
countWords('')                         // → 0
countWords('one two three')            // → 3
readingTime(0)                         // → '< 1 min'
readingTime(200)                       // → '~1 min read'
```

## Manual QA Flows

Run after any significant change.

### Flow 1: Session resume
1. Open a workshop, open a specific note, close app
2. Reopen app
3. ✓ Same note is open, cursor at end, content intact

### Flow 2: Note switch safety
1. Open note A, type something (unsaved state shows)
2. Without waiting for autosave, open note B
3. Reopen note A
4. ✓ Changes saved (flushSave ran before switch)

### Flow 3: Scratch entry (⌘S)
1. Press ⌘S → scratch.md opens (or switches to it)
2. ✓ A timestamped divider is appended, cursor below it, ready to write
3. Press ⌘S again
4. ✓ Another divider appended below the previous entry
5. First-time only: ✓ toast appears, fades after 4s, never appears again

### Flow 4: New named note (⌘N)
1. Press ⌘N
2. ✓ New untitled.md created at workshop root (workshop floor)
3. ✓ Editor fades in (opacity transition, not instant)
4. ✓ Cursor is in the title field, ready to type a name
5. Type a title, press Enter or click away
6. ✓ File renamed on disk to match the title
7. ✓ Nav updates, note appears in "notes" section

### Flow 5: Folio creation (⌘D)
1. Press ⌘D on a day with no folio
2. ✓ `folio/YYYY-MM-DD.md` created, editor opens
3. Press ⌘D again → same file (no duplicate)

### Flow 6: Scratch promote
1. Open scratch.md with at least one entry
2. Hover over the divider line of an entry
3. ✓ "→ promote" affordance appears at left margin
4. Click promote
5. ✓ New note opens on workshop floor with entry content
6. ✓ Cursor is in the title field
7. Switch back to scratch.md
8. ✓ Promoted entry is dimmed (0.45 opacity), first line struck through

### Flow 7: Workshop floor in Nav
1. Press ⌘N, create a named note
2. Open Nav (⌘K)
3. ✓ "notes" section appears between scratch and shelves
4. ✓ New note listed there
5. Move note into a shelf
6. ✓ "notes" section disappears if no other floor notes remain

### Flow 8: Typewriter scroll
1. Open a long note, type at top
2. ✓ Cursor scrolls to 38% from bottom, no jitter

### Flow 9: Sound
1. Type characters, enter, backspace, delete
2. ✓ Sounds play, no two identical in a row, 80ms throttle holds

### Flow 10: Nav panel
1. ⌘K opens nav, search focused
2. Type → results filter in real time
3. Click a note → nav closes, note opens
4. ✓ Editor has focus after close

### Flow 11: Empty/edge cases
1. Open workshop with 0 notes → ✓ no crash, folio created
2. Open 0-byte note → ✓ editor opens empty

## CM6-Specific Edge Cases

- **Programmatic content swap**: `setProgrammatic(true)` before dispatch → typewriter must not fire
- **Decoration plugins after doc change**: wikilinks, openQuestions, scratch promoted entries must re-run on every change
- **Multiple EditorView instances**: `view.destroy()` in useEffect cleanup → do not regress
- **Selection after swap**: after note switch, selection anchor should be `doc.length`
- **Scratch decorations**: promoted entry lines must re-decorate correctly after edits to scratch.md

## Tauri FS Edge Cases

- **Permission errors**: if workshop on restricted path, `readDir` throws → handle gracefully
- **File deleted externally**: `lastNotePath` gone → fall back to today's folio
- **Concurrent writes**: autosave + `flushSave()` race → `pendingContentRef` is the guard
- **scratch.md missing**: if deleted externally, ⌘S should recreate it cleanly

## Performance Targets

| Action | Target |
|--------|--------|
| Keystroke → character appears | < 16ms |
| Note switch | < 200ms |
| Nav open | < 50ms |
| Workshop load (100 notes) | < 500ms |
| Sound playback latency | < 30ms after warmup |
| App cold start → ready | < 2s |

## Common Bugs to Watch For

- **Double-save on note switch**: `pendingContentRef` guard prevents this → don't remove
- **Nav refresh on every keystroke**: gated on `navOpen` → keep it that way
- **CM6 focus after overlay**: always call `view.focus()` after closing nav or any overlay
- **Scratch append position**: after appending a new entry, cursor must be at the new blank line, not at doc end — verify the transaction places selection correctly
- **Toast shown twice**: guard with `seenScratchToast` in preferences before showing

## Before Shipping a Feature

1. Run relevant manual QA flows
2. Run unit tests: `npm test`
3. Build: `npm run build` → zero TypeScript errors
4. Run in Tauri dev: `npm run tauri dev` → test in actual desktop app
5. Check UX feel checklist in `gravitas-ux.md`
