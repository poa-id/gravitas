import { ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

const processDeco = Decoration.line({ class: 'cm-gravitas-process' })
const quoteDeco   = Decoration.line({ class: 'cm-gravitas-quote' })

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const text = line.text

    // >> must be checked before > to avoid false match
    if (text.startsWith('>> ') || text === '>>') {
      builder.add(line.from, line.from, processDeco)
    } else if (text.startsWith('> ') || text === '>') {
      builder.add(line.from, line.from, quoteDeco)
    }
  }

  return builder.finish()
}

export const processBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: v => v.decorations }
)
