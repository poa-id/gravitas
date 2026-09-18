# Gravitas

A quiet Markdown writing workshop built around files you own.

Gravitas is not a productivity system or a second brain. It is a place to write without interruption, read what you wrote, finish deliberately, and—when you choose—share a temporary review copy with someone else.

> **Private alpha · 0.1.0**

## The loop

**Write → Read & Review → Audit & Resolve → Share for Review**

- **Write** keeps creation interruption-free.
- **Read & Review** lets you proof by reading and leave contextual marks.
- **Audit & Resolve** is the finishing bench for proofing and reviewer feedback.
- **Share for Review** creates an immutable browser review copy. Reviewers do not need Gravitas or an account and cannot edit the manuscript.

## Ownership and privacy

Your workshop is made of plain Markdown files on your computer. Gravitas has no document database and no telemetry.

Sharing is explicit. Only the selected note snapshot is uploaded for review. Review copies expire after seven days; the original Markdown file remains on your computer. Imported feedback is kept locally.

## Desktop alpha

Gravitas currently targets macOS and Windows through Tauri.

The private alpha installers produced by CI are **unsigned**. macOS Gatekeeper and Windows SmartScreen may therefore block or warn about them. Do not bypass operating-system security policy on managed/work computers. Public distribution will use signed builds; macOS will also be notarized.

## Development

Requirements: Node.js 22+, Rust stable, and the platform prerequisites for Tauri v2.

```sh
npm ci
npm run dev
```

Build the web preview used for UI/flow validation:

```sh
npm run build:web
```

Build the native desktop application:

```sh
npm run tauri build
```

CI validates web builds and native macOS/Windows bundles. Tests are part of the web release gate when a test script is present.

## Product principles

- Plain Markdown is the source of truth.
- No subscription is required to keep access to your writing.
- No unsolicited background network activity.
- Core workflows remain usable with mouse/touch; shortcuts are accelerators.
- Polish before scope.
