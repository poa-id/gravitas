import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import { Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

class HideWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.style.display = 'none'
    return span
  }
  ignoreEvent() { return false }
  get estimatedHeight() { return -1 }
}

const hide = Decoration.replace({ widget: new HideWidget() })

function cursorLine(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const activeLine = cursorLine(view)
  const tree = syntaxTree(view.state)

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const { name, from: nFrom, to: nTo } = node

        const nodeLineStart = view.state.doc.lineAt(nFrom).number
        const nodeLineEnd   = view.state.doc.lineAt(nTo).number
        if (nodeLineStart === activeLine || nodeLineEnd === activeLine) return

        // --- Headings ---
        if (name === 'HeaderMark') {
          const markEnd = nTo
          const afterMark = view.state.sliceDoc(markEnd, markEnd + 1)
          const end = afterMark === ' ' ? markEnd + 1 : markEnd
          ranges.push(hide.range(nFrom, end))
          return
        }

        // --- Bold ---
        if (name === 'StrongEmphasis') {
          const cursor = node.node.cursor()
          if (cursor.firstChild()) {
            do {
              if (cursor.name === 'EmphasisMark') {
                const markLine = view.state.doc.lineAt(cursor.from).number
                if (markLine !== activeLine) {
                  ranges.push(hide.range(cursor.from, cursor.to))
                }
              }
            } while (cursor.nextSibling())
          }
          return false
        }

        // --- Italic ---
        if (name === 'Emphasis') {
          const cursor = node.node.cursor()
          if (cursor.firstChild()) {
            do {
              if (cursor.name === 'EmphasisMark') {
                const markLine = view.state.doc.lineAt(cursor.from).number
                if (markLine !== activeLine) {
                  ranges.push(hide.range(cursor.from, cursor.to))
                }
              }
            } while (cursor.nextSibling())
          }
          return false
        }

        // --- Inline code ---
        if (name === 'InlineCode') {
          const cursor = node.node.cursor()
          if (cursor.firstChild()) {
            do {
              if (cursor.name === 'CodeMark') {
                const markLine = view.state.doc.lineAt(cursor.from).number
                if (markLine !== activeLine) {
                  ranges.push(hide.range(cursor.from, cursor.to))
                }
              }
            } while (cursor.nextSibling())
          }
          return false
        }

        // --- Blockquote: hide the > or >> marker and the space after ---
        if (name === 'QuoteMark') {
          const markLine = view.state.doc.lineAt(nFrom).number
          if (markLine !== activeLine) {
            // Check if this is >> (process) by looking at the next char
            const after = view.state.sliceDoc(nTo, nTo + 2)
            // Hide the mark + the space after it
            const spaceEnd = after.startsWith('> ') || after.startsWith(' ')
              ? nTo + (after[0] === ' ' ? 1 : 0)
              : nTo
            const lineText = view.state.doc.lineAt(nFrom).text
            if (lineText.startsWith('>> ')) {
              // Hide ">>" and the space: 3 chars from line start
              const lineFrom = view.state.doc.lineAt(nFrom).from
              ranges.push(hide.range(lineFrom, lineFrom + 3))
            } else if (lineText.startsWith('> ')) {
              // Hide ">" and the space: 2 chars from line start
              const lineFrom = view.state.doc.lineAt(nFrom).from
              ranges.push(hide.range(lineFrom, lineFrom + 2))
            } else {
              ranges.push(hide.range(nFrom, spaceEnd))
            }
          }
          return false
        }
      },
    })
  }

  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)

  // Remove duplicate/overlapping ranges
  const deduped: Range<Decoration>[] = []
  let lastTo = -1
  for (const r of ranges) {
    if (r.from >= lastTo) {
      deduped.push(r)
      lastTo = r.to
    }
  }

  return Decoration.set(deduped, true)
}

export const markdownRenderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: v => v.decorations }
)
