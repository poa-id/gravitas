# Gravitas — Master Context

Read this file before touching any Gravitas code, planning any feature, or
answering any question about the app.

## What Gravitas Is

A craftsman's markdown note-taking **desktop app**. Not a productivity system.
Not a second brain. A workshop — the place where raw thought becomes shaped work.

Built with: **Tauri v2 + React 19 + TypeScript + CodeMirror 6 + Vite**

Repo: `github.com/poa-id/gravitas`

## The User

The owner (Pedro) — designer/maker and writer. Uses the app on Mac primarily.
Values: ownership, permanence, craft, intentionality, quiet software, and plain
files. Despises: subscriptions, telemetry, clutter, and systems that manage
instead of serve.

## Philosophy (Non-negotiable)

- **Own your files.** Plain `.md` on disk. No database, no lock-in.
- **No interruptions.** No notifications, no suggestions while writing, no unsolicited UI.
- **No telemetry.** Ever.
- **Slow intentional growth.** Polish before scope. Feel before feature.
- **One honest price** (when monetized): single one-time payment.

## Current Architecture

```
src/
  App.tsx                        — root state, session resume, keyboard shortcuts
  styles.css                     — global CSS vars, palette, typography, grain overlay, toast
  editor/
    Editor.tsx                   — CM6 wrapper, topbar, header, statusbar; forwardRef (EditorHandle)
    Editor.css                   — editor layout, CM6 overrides, scratch label, promote affordance
    theme.ts                     — CM6 theme + HighlightStyle (gravatisTheme)
    plugins/
      typewriter.ts              — typewriter scroll (TARGET_RATIO 0.38), setProgrammatic()
      activeLine.ts              — active line opacity (1.0) vs inactive (0.55)
      wikilinks.ts               — [[wikilink]] → widget via MatchDecorator
      openQuestions.ts           — ?? prefix → circular ? badge widget
      typewriterSound.ts         — 6 WAV files, AudioContext, SoundQueue (no repeats)
      scratchPromote.ts          — promote affordance, promoted-entry decorations
  ui/
    Nav.tsx                      — slide-in nav panel, search, folio/scratch/notes/shelves
    Nav.css
    EmptyState.tsx               — first-run screen, "Open a workshop" CTA
    EmptyState.css
  workshop/
    workshopAdapter.ts           — loadWorkshop, readNote, writeNote, ensureTodayFolio, ensureScratch
    preferences.ts               — plugin-store wrapper (onOpen, lastWorkshopPath, lastNotePath,
                                   knownWorkshops, soundEnabled, pasteIntentEnabled, seenScratchToast)
    noteCreation.ts              — createNewNote, titleToFilename, extractTitle, renameNoteOnDisk
src-tauri/
  src/lib.rs                     — Tauri builder, trash_file command, plugin inits (fs/dialog/store/opener)
  src/main.rs                    — calls gravitas_lib::run()
  capabilities/default.json      — fs, dialog, store, opener permissions
  tauri.conf.json                — window 1200x800, min 800x600
```

## Design System

```css
/* Palette */
--bg: #EDEDEA          /* warm parchment */
--bg-subtle: #EBE5DB
--bg-surface: #E4DDD2
--border: #D4CEC4
--text: #1C1814         /* near-black warm */
--text-dim: #6B6560
--text-dimmer: #A09890
--accent: #7A6A4A       /* warm brown — cursor, active dot */
--accent-soft: #C4B89A
--link: #4A6A4A         /* muted green — wikilinks */
--link-soft: #8AAA8A
--warn: #8B5A3A

/* Typography */
--font-prose: 'Lora', Georgia, serif
--font-mono: 'JetBrains Mono', monospace
--font-size: 18px
--line-height: 1.78

/* Layout */
--col-width: 548px (gv-col is 600px max-width)
```

Grain overlay: `body::before` SVG fractalNoise at 0.032 opacity. Do not remove.

## Vocabulary (use these terms consistently)

| Term | Meaning |
|------|---------|
| workshop | the root folder the user opens |
| shelf | a subfolder within the workshop |
| note | a markdown file |
| folio | a daily note (`folio/YYYY-MM-DD.md`) |
| scratch | the quick-capture log (`scratch.md` at workshop root) |
| scratch entry | one timestamped section within scratch.md |
| workshop floor | ungrouped notes at the workshop root (not scratch, not in any shelf) |
| promote | move a scratch entry into a named note on the workshop floor |
| set | save (verb) |
| open | create a new named note (verb) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘S | Append a new timestamped entry to scratch.md (quick capture) |
| ⌘N | Create a new named note on the workshop floor |
| ⌘D | Open today's folio |
| ⌘K | Toggle nav panel |
| ⌘, | Open Preferences |
| ⌘1 / ⌘2 / ⌘3 | Write / Read / Audit |
| Read: C / R / ? / X | Comment / Revisit / Question / Cut? on selection |
| Audit: ⌘Enter | Resolve active review mark |
| Audit: ⌥↓ / ⌥↑ | Next / previous review mark |
| Escape | Close nav; in Read, clear review selection or return to Write |

## Features Implemented

- **Workshop (vault)** system — folder-based, `loadWorkshop()` reads recursively
- **Autosave** — 800ms debounce, `flushSave()` on note switch
- **Typewriter scroll** — cursor held at 38% from bottom (TARGET_RATIO)
- **Active line focus** — active line opacity 1.0, inactive 0.55
- **Typewriter sound** — 6 WAV keys, shuffled queue, 80ms min interval
- **Nav panel** — ⌘K toggle, search, folio/scratch/notes/shelves, slide-in animation
- **Folio** — daily notes at `folio/YYYY-MM-DD.md`, ensured on open
- **Scratch** — `scratch.md` at workshop root; ⌘S appends new timestamped entry
- **Workshop floor** — ungrouped notes at root shown in Nav "Notes" section (left col, below Folio)
- **⌘N** — creates new note on workshop floor with fade-in animation and auto-focus title field
- **⌘D** — opens today's folio
- **⌘K** — nav toggle
- **Wikilinks** `[[name]]` rendered as styled widget
- **Open questions** `?? text` rendered with circular badge
- **Session resume** — `preferences.json` via plugin-store, resumes last note
- **Save state indicator** — dot: green (set), amber (setting), red (unsaved)
- **Word count + reading time** in statusbar
- **Nav features** — collapsible shelves, drag-to-move, inline rename, new shelf, context menu
- **Context menu** — right-click notes for Rename / Move to / Reveal in Finder / Delete
- **Delete** — moves to OS trash via `trash_file` Rust command
- **Reveal in Finder** — via `opener` plugin
- **Promote gesture** — hover a scratch entry divider/timestamp → "↑ promote" affordance
- **Promoted entry styling** — dimmed at 0.45 opacity, first line struck through
- **One-time scratch toast** — appears on first ⌘S, never again (`seenScratchToast` in prefs)
- **Scratch editor mode** — no title, quiet "scratch" label, word count in statusbar
- **Write / Read / Audit** — intent-specific manuscript modes; Write stays interruption-free, Read supports review marks, Audit resolves proofing/review work
- **Local proofing in Audit** — nspell dictionaries; English grammar via Harper where supported
- **Share for Review** — creates an immutable temporary review copy and public review URL; no reviewer account or Gravitas install required
- **Reviewer marks** — Comment / Revisit / Question / Cut?; multiple independent reviewer submissions per share
- **Review import** — reviewer marks return to Audit; general reviewer notes are stored separately and can be dismissed
- **Temporary review transport** — review copies expire after seven days; the local Markdown manuscript remains authoritative
- **Discoverable creation in Nav** — mouse/touch paths for New note, Scratch entry, New shelf, plus contextual + on each shelf

## Scratch Entry Format

Each entry in scratch.md is separated by a divider in this format:

```
---
*MMM D, YYYY · HH:MM*

[entry content here]
```

A promoted entry has a `> ~~promoted~~` marker on the line immediately after
its timestamp line. This line is hidden by the scratchPromote CM6 decoration
but persists in the file for state tracking.

## Workshop Floor

Notes that live at the workshop root (not in any shelf, not `scratch.md`, not
folio notes) are called "workshop floor" notes. They appear in Nav under a
section labelled "Notes", in the left column below Folio. If no floor notes
exist, the section is completely absent from the DOM.

## EditorHandle (imperative ref)

App holds `editorRef = useRef<EditorHandle>(null)`. The Editor exposes:
- `appendEntry(text: string)` — dispatches a CM6 change inserting `text` at doc end, cursor after
- `insertAt(pos: number, text: string)` — dispatches a CM6 change inserting `text` at `pos`

Used by: ⌘S (appendEntry on scratch), promote (insertAt for `> ~~promoted~~` marker).

## Known Patterns & Conventions

- CM6 plugins use `ViewPlugin.fromClass` + `MatchDecorator` for inline decorations
- `setProgrammatic(true/false)` disables typewriter scroll during note switches
- `flushSave()` must be called before any note switch (prevents data loss)
- Note title is derived from filename; `noteTitles` Map in App stores human overrides
- `shelf` is a `string[]` representing folder path relative to workshop root
- Folio notes are identified by `shelf.includes('folio')`
- `isScratch` is true when `activeNote.shelf.length === 0 && activeNote.name === 'scratch'`
- scratch.md lives at workshop root (`shelf: []`, `name: 'scratch'`); use `ensureScratch()`
- Save states: `'set'` | `'setting'` | `'unsaved'`
- UI (topbar/statusbar) auto-hides, reveals on mouse move, hides after 2.5s
- `invoke('trash_file', { path })` calls the Rust trash command
- `revealItemInDir(path)` from `@tauri-apps/plugin-opener` for Reveal in Finder
- `noteTitles` is a `Map<string, string>` in App.tsx keyed by note path
- `isNewNote` state in App triggers fade-in animation + auto-edit title in Editor

## What NOT to Do

- Do not add animations that aren't already in the design language
- Do not add notifications, toasts, or modal dialogs except the one-time scratch toast
- Do not add telemetry, analytics, or any phone-home behavior
- Do not use localStorage or sessionStorage
- Do not break the single-column reading width
- Do not add features to the topbar mode tabs (Write/Read/Audit) until modes are implemented
- Do not use any CSS framework (Tailwind, etc.) — all styles are hand-written CSS variables
- Do not add sub-shelves — one level of folders only
- ⌘S is new scratch entry — NOT save (autosave handles saving silently)


## Current Product Loop (0.1)

Write → Read & Review → Audit & Resolve → Share for Review.

- **Write** is creation. No review/proofing interruption.
- **Read & Review** is proofing by reading and leaving contextual marks.
- **Audit & Resolve** is the finishing bench: proofing, imported reviewer marks, and general reviewer notes.
- **Share for Review** uploads an immutable review copy only. Reviewers can mark but cannot edit the manuscript.
- The common workflow must remain usable with mouse/touch; shortcuts accelerate it but are not required knowledge.

## Share for Review Contract

- Desktop talks to a portable Review API; the current first adapter is a Cloudflare Worker backed by D1 + R2.
- Public review token and private owner key have separate roles; secrets are hashed server-side.
- A share expires after exactly seven days. A fresh share creates a fresh URL.
- One URL may receive multiple reviewer submissions.
- Remote review copies are transport, not storage. Imported feedback persists locally under `.gravitas/reviews/`; local share metadata lives under `.gravitas/shares/`.
- Changed or ambiguous passages must fail visibly during anchoring rather than silently attaching to an arbitrary passage.
- Reviewer links/wikilinks are static snapshot content; they do not navigate the author's workshop.

## Release 0.1 Gate

Before merging `release/v1` to `main`: core/share manual QA, clean browser console, persistence and Markdown/rendering smoke tests, documentation current, `npm ci` + `build:web` green, tests green when present, and native Tauri builds validated for macOS and Windows. Never merge to `main` without explicit owner approval.
