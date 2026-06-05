# Gravitas Feature Implementation

Read `gravitas-context.md` first. This file covers the how of building.

## Feature Workflow

Every feature follows this sequence — no exceptions:

1. **Spec first**: What does done look like? Write it in one paragraph.
2. **Identify the boundary**: Is this pure frontend, CM6 extension, Tauri FS, or all three?
3. **Identify what it touches**: which existing files change, which are new?
4. **Implement smallest piece first**: get it working before making it right
5. **Run the QA checklist** from `gravitas-qa.md`
6. **Feel test**: Does it feel like Gravitas? Check `gravitas-ux.md`

## CM6 Extension Patterns

### Pattern 1: Inline decoration (MatchDecorator)
Use for: replacing syntax with a widget, styling a matched pattern.
Examples: wikilinks, open questions, tally marks.

```ts
import { MatchDecorator, ViewPlugin, DecorationSet, ViewUpdate, WidgetType } from '@codemirror/view'
import { EditorView } from '@codemirror/view'

class MyWidget extends WidgetType {
  constructor(readonly text: string) { super() }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'gv-my-widget'
    span.textContent = this.text
    return span
  }
  ignoreEvent() { return false }
}

const myMatcher = new MatchDecorator({
  regexp: /your-pattern-here/g,
  decoration: (match) => Decoration.replace({ widget: new MyWidget(match[1]) }),
})

export const myPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = myMatcher.createDeco(view) }
    update(update: ViewUpdate) { this.decorations = myMatcher.updateDeco(update, this.decorations) }
  },
  { decorations: v => v.decorations }
)
```

Register in `Editor.tsx` extensions array.

### Pattern 2: Cursor-aware decoration (hide-syntax-near-cursor)
Use for: live markdown rendering — show rendered form when cursor is away,
show syntax when cursor is on the line.

```ts
buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number

  for (const { from, to } of view.visibleRanges) {
    // Iterate lines in visible range
    // If line.number !== cursorLine → apply hide-syntax decoration
    // If line.number === cursorLine → don't apply (show raw syntax)
  }
  return builder.finish()
}
```

The `activeLineScaling` plugin in `activeLine.ts` is a good reference.

### Pattern 3: Line decoration (class on whole line)
Use for: styling entire lines differently (blockquotes, code blocks, headings).
Reference: `activeLine.ts` — adds `cm-gravitas-active` / `cm-gravitas-inactive`.

### Pattern 4: Mark decoration (style a range without replacing)
Use for: coloring a span without adding a widget.

```ts
Decoration.mark({ class: 'gv-bold' }).range(from, to)
```

### Decoration gotchas
- Decorations **must** be sorted by `from` position — use `RangeSetBuilder`
- `Decoration.replace` on a range spanning a line break causes issues — avoid
- `MatchDecorator` handles viewport-only optimization automatically — prefer it
- Always handle `update.docChanged` and `update.selectionSet` in `ViewPlugin.update()`
- The `decorations` field must be declared and returned via the second `fromClass` argument

## Scratchpad Pattern

### isScratch detection
In `App.tsx`, detect when `activeNote` is the scratch file:

```ts
const isScratch = activeNote?.shelf.length === 0 && activeNote?.name === 'scratch'
```

Pass `isScratch={isScratch}` as a prop to `Editor`.

### Append-entry format
Each new scratch entry appends the following to the end of `scratch.md`:

```
[blank line]
---
*MMM D, YYYY · HH:MM*
[blank line]
```

Cursor lands on the blank line after the timestamp, ready to write.
Build the timestamp string with:

```ts
const now = new Date()
const formatted = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const divider = `\n---\n*${formatted} · ${time}*\n\n`
```

### Promoted entry marker
After a scratch entry is promoted to a note, insert `> ~~promoted~~` on the
line immediately after the entry's `---` divider. This line is hidden by a CM6
`MatchDecorator` decoration but persists in the file for state tracking.

The promoted entry renders at 0.45 opacity via a line decoration applied to all
lines between the promoted marker and the next divider.

### Promote flow
1. User hovers over a scratch entry's divider or timestamp line
2. A quiet "→ promote" affordance fades in at the left margin (150ms)
3. On click: extract the entry text, create a new note on the workshop floor
   with that content pre-filled, open it with cursor in the title field
4. Insert `> ~~promoted~~` after the source divider in scratch.md
5. Save scratch.md immediately

## Workshop Floor in Nav

The workshop floor is the section of Nav showing notes at the workshop root
that are not `scratch.md` and not folio notes.

In `Nav.tsx`, after loading the workshop, filter:

```ts
const floorNotes = workshop.notes.filter(n =>
  n.shelf.length === 0 &&
  n.name !== 'scratch' &&
  !n.shelf.includes('folio')
)
```

Render as a section labelled "notes" between the scratch entry and the shelves.
If `floorNotes.length === 0`, render nothing (hide the section entirely).

## Live Markdown Rendering — Implementation Notes

**What it does**: When cursor is NOT on a line, hide markdown syntax. When
cursor IS on the line, reveal raw syntax.

**Scope for v1**:
1. Headings: hide `#`/`##`/`###` prefix when cursor is away
2. Bold: hide `**` markers
3. Italic: hide `*`/`_` markers
4. Inline code: style without showing backticks
5. Links: `[text](url)` → show text, hide URL+brackets

**Implementation file**: `src/editor/plugins/markdownRender.ts`

Use the CM6 syntax tree:
```ts
import { syntaxTree } from '@codemirror/language'
// Node types: ATXHeading1, ATXHeading2, StrongEmphasis, Emphasis, etc.
```

## Editable Title / Rename — Implementation Notes

**What it does**: Click the `gv-title` h1 → becomes an input. On blur or
Enter → write new name to disk, update App state.

**The coupling**: filename → display title. Steps:
1. User edits title in UI
2. `titleToFilename(newTitle)` → new filename (in `noteCreation.ts`)
3. `renameNoteFromTitle()` already exists in `noteCreation.ts`
4. Need: actual `rename()` from `@tauri-apps/plugin-fs`
5. Update `activeNote` state, `preferences.lastNotePath`, refresh workshop

**Edge cases**:
- Empty title → don't rename
- Same filename → don't rename
- Collision → keep old name
- Folio notes → NOT renameable
- Demo note → NOT renameable

## Tally Marks — Implementation Notes

**What it does**: `||||` renders as tally strokes, `|||||` as a crossed group.

**Approach**: MatchDecorator, replace with SVG widget.
Tally groups: every 5 marks renders as a gate (4 vertical + 1 diagonal).

## Preferences UI — Implementation Notes

**Settings to expose**:
- `onOpen`: 'resume' | 'folio'
- Sound: on/off
- Workshop: current path, button to open different
- Known workshops: list with switch option

**Pattern**: Same overlay pattern as Nav. `isPrefsOpen` state in App.

**Sound preference**: add `soundEnabled: boolean` to `GravitasPreferences`
with default `true`, wire to `Editor` prop.

## Tauri Command Pattern

```rust
// src-tauri/src/lib.rs
#[tauri::command]
fn my_command(arg: String) -> Result<String, String> {
    Ok(result)
}
// Add to invoke_handler: tauri::generate_handler![greet, my_command]
```

```ts
// TypeScript
import { invoke } from '@tauri-apps/api/core'
const result = await invoke<string>('my_command', { arg: 'value' })
```

## Definition of Done

A feature is done when:
- [ ] It works correctly in `npm run tauri dev`
- [ ] `npm run build` has zero TypeScript errors
- [ ] The QA flows from `gravitas-qa.md` that touch this feature pass
- [ ] The UX feel checklist from `gravitas-ux.md` passes
- [ ] No new `console.error` in normal operation
- [ ] No visual regression in Editor (column width, typography, grain, statusbar)
- [ ] The feature respects the silence (no new unsolicited UI)
