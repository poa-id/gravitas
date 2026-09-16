# Gravitas — Modes & Review Loop

## Core loop

**Write → Read & Review → Audit & Resolve → Write**

Changing modes changes the writer's intent and available tools, never the manuscript itself.
The common path should require no mouse travel.

## Write

Purpose: create and shape the manuscript.

- The document is editable Markdown.
- Keep the existing Gravitas writing surface, typography, width, palette, grain and rhythm.
- Authoring syntax and deliberate marks such as `??` belong here.
- No unsolicited spelling, repetition, scoring or review feedback while writing.
- Writing must remain the quietest mode.

## Read & Review

Purpose: experience the manuscript as a reader and leave lightweight review marks without editing it.

- Same Gravitas visual identity as Write; this is not a second editorial theme.
- Markdown is rendered rather than shown as authoring syntax.
- Read-only manuscript.
- UI retreats so the manuscript dominates; fullscreen is a natural extension.
- Review should eventually support extremely low-friction selection → mark/comment → continue reading.
- Review marks may have different intents (for example comment, revisit, question, cut), with mode-specific hotkeys.
- Review metadata must not contaminate the `.md` source file. Sidecar storage is preferred.
- Comments and marks must survive ordinary edits through robust anchoring/re-anchoring; never silently attach a review to uncertain text.

## Audit & Resolve

Purpose: inspect, correct and finish deliberately.

- Audit may edit the manuscript contextually so resolving an issue does not require mode-hopping.
- Review marks become actionable and navigable: previous/next, resolve, and ignore where appropriate.
- Local/offline spelling with English and Spanish dictionaries belongs here, with a personal dictionary.
- Later descriptive anatomy may include repetition, structure, paragraph/sentence rhythm and explicit `??` questions.
- No AI rewriting, quality scores, gamification or unsolicited judgments.

## Shortcuts

Shortcuts are contextual. Gravitas should have a small global vocabulary plus a small vocabulary for the active mode.

- Global navigation/workshop shortcuts remain available across modes.
- Write shortcuts are for creation.
- Read shortcuts are for review marks and comments.
- Audit shortcuts are for navigating and resolving issues.
- The shortcut sheet must show the active mode's commands first rather than becoming a global command encyclopedia.

Exact review/audit keys should be validated through real writing before being locked.

## Read / PDF parity

PDF export is the printable form of the Gravitas reading experience, not a separately designed publishing template.

Write, Read and PDF should preserve the same prose typeface, scale, column rhythm and hierarchy as closely as their media allow. PDF may adapt background/ink and physical page margins for paper, but must not invent a different typography or wider editorial layout.
