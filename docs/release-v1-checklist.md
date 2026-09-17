# Gravitas v1 — Release Candidate Checklist

This branch is feature-frozen once `release/v1` is cut. Only release blockers, regressions, accessibility fixes, and polish belong here.

## Build gates

- [ ] `npm run build` passes
- [ ] Native Tauri build passes on macOS
- [ ] Browser preview build passes
- [ ] No unexpected TypeScript errors or warnings introduced by the release branch
- [ ] Grain overlay and bundled fonts render correctly

## First run and workshop

- [ ] Fresh launch shows the first-run Gravitas premise clearly
- [ ] Open a workshop from first run
- [ ] Existing workshop resumes correctly
- [ ] Preferences persist across relaunch
- [ ] Regular is the default interface size for a fresh install
- [ ] Small preserves the original Gravitas UI scale
- [ ] Large remains usable without clipping or overlapping controls
- [ ] Open/switch workshop from Preferences

## Writing and files

- [ ] Create a note with Cmd/Ctrl+N
- [ ] Rename a note
- [ ] Move a note between workshop floor and shelf
- [ ] Delete a note to OS trash
- [ ] Reveal a note in Finder / file manager
- [ ] Create, rename, collapse, expand, and delete a shelf
- [ ] Drag a note to a shelf
- [ ] Search finds expected notes
- [ ] Autosave persists edits
- [ ] Switching notes never loses pending text

## Scratch and Folio

- [ ] Cmd/Ctrl+S opens/appends Scratch rather than invoking Save
- [ ] Scratch entry format remains intact
- [ ] Promote a Scratch entry into a note
- [ ] Promoted entry state remains visible and persistent
- [ ] Cmd/Ctrl+D opens today's Folio
- [ ] Folio rollover/session behavior is sane around date changes

## Write → Read → Audit

- [ ] Cmd/Ctrl+1 enters Write
- [ ] Cmd/Ctrl+2 enters Read
- [ ] Cmd/Ctrl+3 enters Audit
- [ ] Read renders Markdown without exposing editor syntax unnecessarily
- [ ] Add Comment, Revisit, Question, and Cut? review marks
- [ ] Review marks paint immediately and remain selection-safe
- [ ] Audit navigates to the correct source selection
- [ ] Long review selections remain usable
- [ ] Blockquote review selections locate correctly in Audit
- [ ] Resolve review with button and Cmd/Ctrl+Enter
- [ ] Option+Up / Option+Down navigate reviews
- [ ] Resolved reviews do not return as open after relaunch

## Export and navigation

- [ ] PDF export succeeds and matches the manuscript visual language
- [ ] Cmd/Ctrl+K opens/closes Navigation
- [ ] Escape closes Navigation and Preferences appropriately
- [ ] Cmd/Ctrl+, opens Preferences
- [ ] Preferences lives in the Navigation footer rather than the manuscript/status UI
- [ ] Status bar contains manuscript/session actions only

## Accessibility

- [ ] All interactive Preferences controls are keyboard reachable
- [ ] Keyboard focus is visible
- [ ] Functional text remains legible at Small, Regular, and Large
- [ ] No essential action is hover-only without a keyboard/touch path
- [ ] Core controls have useful accessible names/semantics
- [ ] Contrast is acceptable for functional text and controls

## Release identity

- [ ] Preferences footer identifies Gravitas and its maker
- [ ] Copyright notice is present
- [ ] App/package metadata contains the correct product name, author/publisher, and version
- [ ] Version is set intentionally for v1
- [ ] Production binaries are signed/notarized where applicable before public distribution

## Final manual smoke test

Use a disposable workshop containing normal prose, headings, emphasis, blockquotes, wikilinks, long paragraphs, Scratch entries, Folio notes, shelves, and review marks. Complete one uninterrupted loop:

**Write → Read & Review → Audit & Resolve → Export → Relaunch**

Only merge the exact tested release commit into `main`.
