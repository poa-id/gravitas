import { ViewPlugin, DecorationSet, ViewUpdate, EditorView, Decoration, WidgetType } from '@codemirror/view'
import { RangeSetBuilder, EditorState, Transaction } from '@codemirror/state'
import type { RefObject } from 'react'

// ── Entry divider format ───────────────────────────────────────────────────
// Each entry starts with a line: § MMM D, YYYY · H:MM AM/PM
// The § prefix is invisible to markdown, unique to parse, renders as a widget.
// Promoted entries have a line immediately after the § line: §promoted

const DIVIDER_RE = /^§ .+$/        // § Jun 6, 2026 · 9:04 AM
const PROMOTED_MARKER = '§promoted'

// ── Widget: renders divider line as thin stroke + small date ──────────────

class DividerWidget extends WidgetType {
  constructor(readonly dateText: string) { super() }

  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'gv-scratch-divider'

    const line = document.createElement('div')
    line.className = 'gv-scratch-divider-line'

    const date = document.createElement('span')
    date.className = 'gv-scratch-divider-date'
    date.textContent = this.dateText

    wrap.appendChild(line)
    wrap.appendChild(date)
    return wrap
  }

  ignoreEvent() { return true }
  get estimatedHeight() { return 28 }
}

// ── Entry parsing ──────────────────────────────────────────────────────────

interface ScratchEntry {
  dividerLineNo: number
  promoted: boolean
  markerLineNo: number  // line of §promoted (-1 if none)
  dateText: string
}

function parseEntries(doc: EditorView['state']['doc']): ScratchEntry[] {
  const entries: ScratchEntry[] = []

  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text
    if (!DIVIDER_RE.test(text)) continue

    const dateText = text.slice(2).trim() // strip leading "§ "

    const markerLineNo = i + 1
    let promoted = false
    let markerLine = -1
    if (markerLineNo <= doc.lines && doc.line(markerLineNo).text === PROMOTED_MARKER) {
      promoted = true
      markerLine = markerLineNo
    }

    entries.push({ dividerLineNo: i, promoted, markerLineNo: markerLine, dateText })
  }

  return entries
}

function nextDividerLineNo(entries: ScratchEntry[], afterDivider: number, totalLines: number): number {
  for (const e of entries) {
    if (e.dividerLineNo > afterDivider) return e.dividerLineNo
  }
  return totalLines + 1
}

// ── Read-only filter ───────────────────────────────────────────────────────
// Blocks single-line edits to divider lines and §promoted markers.
// Allows multi-line selections spanning them (whole-entry deletion).

export function scratchReadonlyExtension(isScratchFn: () => boolean) {
  return EditorState.transactionFilter.of((tr: Transaction) => {
    if (!isScratchFn() || !tr.docChanged) return tr
    let blocked = false
    tr.changes.iterChanges((fromA, toA) => {
      const doc = tr.startState.doc
      const fromLine = doc.lineAt(fromA)
      const toLine = doc.lineAt(toA)
      if (toLine.number > fromLine.number) return  // multi-line: allow
      const text = fromLine.text
      if (DIVIDER_RE.test(text) || text === PROMOTED_MARKER) {
        blocked = true
      }
    })
    return blocked ? [] : tr
  })
}

// ── Plugin factory ─────────────────────────────────────────────────────────

export function createScratchPromotePlugin(
  onPromoteRef: RefObject<((content: string, insertAfterPos: number) => void) | undefined>
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      entries: ScratchEntry[] = []
      affordanceEl: HTMLElement
      hoveredDividerLineNo: number = -1
      hideTimer: ReturnType<typeof setTimeout> | null = null
      affordanceHovered: boolean = false

      constructor(readonly view: EditorView) {
        this.entries = parseEntries(view.state.doc)
        this.decorations = this.buildDecorations()

        this.affordanceEl = document.createElement('div')
        this.affordanceEl.className = 'gv-promote'
        this.affordanceEl.textContent = '↑ promote'
        document.body.appendChild(this.affordanceEl)

        this.affordanceEl.addEventListener('click', () => this.handlePromoteClick())
        this.affordanceEl.addEventListener('mouseenter', () => {
          this.affordanceHovered = true
          if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null }
        })
        this.affordanceEl.addEventListener('mouseleave', () => {
          this.affordanceHovered = false
          this.scheduleHide()
        })

        this.onMouseMove = this.onMouseMove.bind(this)
        this.onMouseLeave = this.onMouseLeave.bind(this)
        view.dom.addEventListener('mousemove', this.onMouseMove)
        view.dom.addEventListener('mouseleave', this.onMouseLeave)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.entries = parseEntries(update.view.state.doc)
          this.decorations = this.buildDecorations()
        }
      }

      buildDecorations(): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>()
        const doc = this.view.state.doc
        const ranges: Array<{ from: number; to: number; deco: Decoration }> = []

        for (const entry of this.entries) {
          const divLine = doc.line(entry.dividerLineNo)

          // Replace the § line with a visual widget
          ranges.push({
            from: divLine.from,
            to: divLine.to,
            deco: Decoration.replace({ widget: new DividerWidget(entry.dateText), block: true })
          })

          if (entry.promoted && entry.markerLineNo > 0 && entry.markerLineNo <= doc.lines) {
            // Hide the §promoted marker line
            const markerLine = doc.line(entry.markerLineNo)
            ranges.push({
              from: markerLine.from,
              to: markerLine.to,
              deco: Decoration.replace({})
            })

            // Dim and strike first content line, dim rest
            const contentStart = entry.markerLineNo + 1
            const contentEnd = nextDividerLineNo(this.entries, entry.dividerLineNo, doc.lines) - 1
            let first = true
            for (let ln = contentStart; ln <= Math.min(contentEnd, doc.lines); ln++) {
              const from = doc.line(ln).from
              ranges.push({
                from, to: from,
                deco: Decoration.line({ class: first ? 'gv-promoted-first' : 'gv-promoted-entry' })
              })
              first = false
            }
          }
        }

        // Must be sorted by from position for RangeSetBuilder
        ranges.sort((a, b) => a.from !== b.from ? a.from - b.from : a.to - b.to)
        for (const { from, to, deco } of ranges) {
          builder.add(from, to, deco)
        }

        return builder.finish()
      }

      onMouseMove(e: MouseEvent) {
        if (!onPromoteRef.current) { this.scheduleHide(); return }
        const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos === null) { this.scheduleHide(); return }

        const lineNo = this.view.state.doc.lineAt(pos).number
        const entry = this.entries.find(en => !en.promoted && en.dividerLineNo === lineNo)

        if (!entry) { this.scheduleHide(); return }

        if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null }
        this.hoveredDividerLineNo = entry.dividerLineNo

        const lineFrom = this.view.state.doc.line(entry.dividerLineNo).from
        const coords = this.view.coordsAtPos(lineFrom)
        if (!coords) { this.scheduleHide(); return }

        this.affordanceEl.style.top = `${coords.top + window.scrollY}px`
        this.affordanceEl.style.left = `${coords.left - 80}px`
        this.affordanceEl.classList.add('visible')
      }

      onMouseLeave() { this.scheduleHide() }

      scheduleHide() {
        if (this.affordanceHovered) return
        if (this.hideTimer) return
        this.hideTimer = setTimeout(() => {
          if (!this.affordanceHovered) {
            this.affordanceEl.classList.remove('visible')
            this.hoveredDividerLineNo = -1
          }
          this.hideTimer = null
        }, 120)
      }

      handlePromoteClick() {
        if (this.hoveredDividerLineNo < 0 || !onPromoteRef.current) return
        const doc = this.view.state.doc
        const entry = this.entries.find(e => e.dividerLineNo === this.hoveredDividerLineNo)
        if (!entry) return

        const contentStart = entry.dividerLineNo + 1
        const contentEnd = nextDividerLineNo(this.entries, entry.dividerLineNo, doc.lines) - 1

        const lines: string[] = []
        for (let ln = contentStart; ln <= Math.min(contentEnd, doc.lines); ln++) {
          lines.push(doc.line(ln).text)
        }
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
        const content = lines.join('\n')

        const divLine = doc.line(entry.dividerLineNo)
        const insertAfterPos = divLine.to + 1

        onPromoteRef.current(content, insertAfterPos)

        this.affordanceHovered = false
        this.affordanceEl.classList.remove('visible')
        this.hoveredDividerLineNo = -1
      }

      destroy() {
        this.view.dom.removeEventListener('mousemove', this.onMouseMove)
        this.view.dom.removeEventListener('mouseleave', this.onMouseLeave)
        if (this.hideTimer) clearTimeout(this.hideTimer)
        this.affordanceEl.remove()
      }
    },
    { decorations: v => v.decorations }
  )
}
