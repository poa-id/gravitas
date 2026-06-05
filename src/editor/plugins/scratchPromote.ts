import { ViewPlugin, DecorationSet, ViewUpdate, EditorView, Decoration } from '@codemirror/view'
import { RangeSetBuilder, EditorState, Transaction } from '@codemirror/state'
import type { RefObject } from 'react'

// ── Decoration types ───────────────────────────────────────────────────────

const promotedMarkerDeco = Decoration.line({ class: 'gv-promoted-marker' })
const promotedFirstDeco  = Decoration.line({ class: 'gv-promoted-first' })
const promotedEntryDeco  = Decoration.line({ class: 'gv-promoted-entry' })

// ── Entry parsing ──────────────────────────────────────────────────────────

interface ScratchEntry {
  dividerLineNo: number     // line number of ---
  timestampLineNo: number   // line number of *timestamp*
  promoted: boolean
  markerLineNo: number      // line number of > ~~promoted~~ (-1 if none)
}

function parseEntries(doc: EditorView['state']['doc']): ScratchEntry[] {
  const entries: ScratchEntry[] = []

  for (let i = 1; i <= doc.lines; i++) {
    const lineText = doc.line(i).text
    if (lineText !== '---') continue

    const tsLineNo = i + 1
    if (tsLineNo > doc.lines) continue
    const tsText = doc.line(tsLineNo).text
    if (!tsText.startsWith('*') || !tsText.endsWith('*')) continue

    const markerLineNo = tsLineNo + 1
    let promoted = false
    let markerLine = -1
    if (markerLineNo <= doc.lines && doc.line(markerLineNo).text === '> ~~promoted~~') {
      promoted = true
      markerLine = markerLineNo
    }

    entries.push({ dividerLineNo: i, timestampLineNo: tsLineNo, promoted, markerLineNo: markerLine })
  }

  return entries
}

function nextDividerLineNo(entries: ScratchEntry[], afterDivider: number, totalLines: number): number {
  for (const e of entries) {
    if (e.dividerLineNo > afterDivider) return e.dividerLineNo
  }
  return totalLines + 1
}

// ── Read-only filter for divider and timestamp lines ───────────────────────

export function scratchReadonlyExtension(isScratchFn: () => boolean) {
  return EditorState.transactionFilter.of((tr: Transaction) => {
    if (!isScratchFn() || !tr.docChanged) return tr
    let blocked = false
    tr.changes.iterChanges((fromA, toA) => {
      const doc = tr.startState.doc
      const fromLine = doc.lineAt(fromA)
      const toLine = doc.lineAt(toA)
      for (let ln = fromLine.number; ln <= toLine.number; ln++) {
        if (ln > doc.lines) break
        const text = doc.line(ln).text.trim()
        if (text === '---' || (/^\*[^*]+\*$/.test(text))) {
          blocked = true
          break
        }
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

        // Keep affordance alive when mouse moves onto it
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
        if (update.docChanged) {
          this.entries = parseEntries(update.view.state.doc)
          this.decorations = this.buildDecorations()
        }
      }

      buildDecorations(): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>()
        const doc = this.view.state.doc
        const ranges: Array<{ from: number; deco: Decoration }> = []

        for (const entry of this.entries) {
          if (!entry.promoted || entry.markerLineNo < 1) continue
          if (entry.markerLineNo > doc.lines) continue

          const markerFrom = doc.line(entry.markerLineNo).from
          ranges.push({ from: markerFrom, deco: promotedMarkerDeco })

          const contentStartLineNo = entry.markerLineNo + 1
          const contentEndLineNo = nextDividerLineNo(this.entries, entry.dividerLineNo, doc.lines) - 1

          let first = true
          for (let ln = contentStartLineNo; ln <= Math.min(contentEndLineNo, doc.lines); ln++) {
            const from = doc.line(ln).from
            ranges.push({ from, deco: first ? promotedFirstDeco : promotedEntryDeco })
            first = false
          }
        }

        ranges.sort((a, b) => a.from - b.from)
        for (const { from, deco } of ranges) {
          builder.add(from, from, deco)
        }

        return builder.finish()
      }

      onMouseMove(e: MouseEvent) {
        if (!onPromoteRef.current) { this.scheduleHide(); return }

        const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos === null) { this.scheduleHide(); return }

        const lineNo = this.view.state.doc.lineAt(pos).number

        const entry = this.entries.find(
          en => !en.promoted && (en.dividerLineNo === lineNo || en.timestampLineNo === lineNo)
        )

        if (!entry) { this.scheduleHide(); return }

        // Cancel any pending hide
        if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null }

        this.hoveredDividerLineNo = entry.dividerLineNo

        const lineFrom = this.view.state.doc.line(entry.dividerLineNo).from
        const coords = this.view.coordsAtPos(lineFrom)
        if (!coords) { this.scheduleHide(); return }

        this.affordanceEl.style.top = `${coords.top + window.scrollY}px`
        this.affordanceEl.style.left = `${coords.left - 72}px`
        this.affordanceEl.classList.add('visible')
      }

      onMouseLeave() {
        this.scheduleHide()
      }

      scheduleHide() {
        if (this.affordanceHovered) return
        if (this.hideTimer) return
        // 120ms grace period — enough to move from editor to affordance
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

        const contentStartLineNo = entry.timestampLineNo + 1
        const contentEndLineNo = nextDividerLineNo(this.entries, entry.dividerLineNo, doc.lines) - 1

        const lines: string[] = []
        for (let ln = contentStartLineNo; ln <= Math.min(contentEndLineNo, doc.lines); ln++) {
          lines.push(doc.line(ln).text)
        }
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
        const content = lines.join('\n')

        const tsLine = doc.line(entry.timestampLineNo)
        const insertAfterPos = tsLine.to + 1

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
