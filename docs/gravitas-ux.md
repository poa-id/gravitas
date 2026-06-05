# Gravitas UX

Read `gravitas-context.md` first — this file layers on top of it.

## The Core Feel

Gravitas should feel like a sharpened tool. Not a software product, not an app
— a physical instrument that happens to run on a computer. Like a good mechanical
keyboard, a well-maintained fountain pen, a finely tuned instrument. It gives
back in:

- **Satisfaction** — things click into place, sound right, respond immediately
- **Connection** — it feels personal, like yours, not generic
- **Intentionality** — every element is there for a reason, nothing is decorative

The test for any new UI element: *would a master craftsman include this in their tool?*

## Motion & Animation Rules

### What's allowed
- **Opacity fades**: topbar/statusbar reveal on mouse move (300ms ease, 2.5s threshold)
- **Nav slide-in**: `translateX(-8px)` → `0` over 180ms ease
- **Active line transition**: 150ms ease on opacity (1.0 → 0.55)
- **Hover transitions**: 100–150ms ease on background/color only
- **New note fade-in**: editor opacity 0 → 1 over 300ms ease, on ⌘N only
- **Toast fade**: opacity 0 → 1 over 200ms on appear, reverse on dismiss

### What's not allowed
- No transform animations on content (no sliding notes in/out)
- No bounce, spring, or elastic easing
- No loading spinners
- No skeleton screens
- No animated progress bars
- No entrance animations on text content

### Timing reference
| Action | Duration |
|--------|----------|
| Hover state | 100–150ms |
| Active line | 150ms |
| Nav slide | 180ms |
| UI reveal/hide | 300ms |
| New note fade-in | 300ms |
| Toast appear/dismiss | 200ms |
| Toast display duration | 4000ms |
| Autosave debounce | 800ms |
| UI hide timeout | 2500ms |

## Interaction Principles

### Silence first
The app should be quiet until the user acts. No UI should appear on load unless
essential. Topbar and statusbar hide by default — surface only on mouse move.

### Keyboard-native
Every primary action has a keyboard shortcut. Mouse should be optional.

Current shortcuts:
- `⌘S` — append new scratch entry
- `⌘N` — new named note (workshop floor)
- `⌘D` — today's folio
- `⌘K` — nav toggle
- `Escape` — close nav

New shortcuts: single modifier + single letter, memorable.

### No confirmation dialogs
Never ask "are you sure?" — autosave means nothing is lost.

### Instant response
Every interaction responds in the same frame. No async gaps in the UI.

### Focus discipline
- When a note opens: cursor goes to end of content, editor takes focus
- When ⌘N opens a new note: cursor goes to title field, ready to type the name
- When nav closes: editor takes focus. Always.
- Tab focus should never get stranded.

## The One-Time Scratch Toast

The first time the user presses ⌘S, a single quiet toast appears:

- **Text**: "your work is always saved.  ⌘S opens a new scratch entry."
- **Style**: `--bg-surface` background, `--border` border, `--text-dim` color, 13px Lora
- **Position**: fixed, bottom 32px, centered in editor column, max-width matches `--col-width`
- **Timing**: fade in 200ms, display 4s, fade out 200ms
- **Frequency**: shown exactly once, never again (`seenScratchToast` in preferences)

This is the only toast in the app. It is not a notification — it is a one-time
orientation moment. Future features should not add toasts.

## The Feel Checklist

Before shipping any change, verify:

- [ ] Does it respect the silence? (no new sounds, popups, or unsolicited UI)
- [ ] Does the cursor/caret behave correctly after this change?
- [ ] Does the typewriter scroll still work correctly?
- [ ] Does autosave still flush before note switches?
- [ ] Is the typography unchanged? (no font-size, line-height, or weight surprises)
- [ ] Is the column width preserved? (600px max, centered)
- [ ] Does it work with keyboard only?
- [ ] Is there any visual jitter or reflow?
- [ ] Does it look right at both narrow (800px) and wide (1400px+) widths?
- [ ] Is the grain overlay still visible? (z-index 9999, pointer-events none)

## Typography Contract

Never change these without explicit design intent:
- Body: Lora 18px / 1.78 line-height
- Headings: Lora 500 weight (h1: 1.35em, h2: 1.18em, h3: 1.05em)
- UI chrome: Lora serif (same family)
- Mono: JetBrains Mono 0.9em / `--text-dim`
- Heading punctuation and markdown syntax: `--text-dimmer`

The parchment palette is warm. Avoid cool grays or blues.

## Component Patterns

### Buttons
- No border, no shadow — background on hover (`--bg-subtle` → `--bg-surface`)
- Border-radius: 2px
- Cursor: pointer
- No outline on focus in editor context

### Inputs
- `--bg-subtle` background, `--border` border, 2px radius
- On focus: `--accent-soft` border, `--bg` background
- No box-shadow on focus — border color change only
- Placeholder: `--text-dimmer`

### Labels / badges
- `--text-dimmer` color, 9–11px, `letter-spacing: 0.08–0.1em`, uppercase
- Border: `1px solid --border` for type badges

### Section labels (Nav)
- `--text-dimmer`, 10px, uppercase, `letter-spacing: 0.1em`
- Used for: FOLIO, SCRATCH, NOTES, shelf names

### Dots (status indicators)
- 5px circle, `border-radius: 50%`
- Save states: green (`--link`), amber (`--accent-soft`), red (`--warn`)

### Promote affordance (scratch entries)
- Appears at left margin on hover of entry divider or timestamp line
- "→ promote" in `--text-dimmer`, 11px, fades in 150ms
- On click: promotes entry to named note on workshop floor

### Promoted entry style
- Entire entry dims to 0.45 opacity after promotion
- First content line gets CSS strikethrough
- `> ~~promoted~~` marker line is hidden (CM6 decoration)

## Spacing System

- Tight (within components): 4–6px
- Medium (between related elements): 8–12px
- Section spacing: 20–24px
- Page margins: 24–28px horizontal, 40px top padding for content
- Column horizontal padding: 48px from viewport edge

## Writing About UX Changes

When describing a UX change:
1. State what it does in one sentence
2. State what it feels like (not what it looks like)
3. Note edge cases to test manually
4. Note existing behavior it touches
