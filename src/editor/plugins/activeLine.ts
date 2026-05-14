import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

const activeLineDeco = Decoration.line({ class: 'cm-gravitas-active' })
const inactiveLineDeco = Decoration.line({ class: 'cm-gravitas-inactive' })

export const activeLineScaling = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const selection = view.state.selection.main
      const activeLine = view.state.doc.lineAt(selection.head)

      for (let i = 1; i <= view.state.doc.lines; i++) {
        const line = view.state.doc.line(i)
        if (line.number === activeLine.number) {
          builder.add(line.from, line.from, activeLineDeco)
        } else {
          builder.add(line.from, line.from, inactiveLineDeco)
        }
      }

      return builder.finish()
    }
  },
  { decorations: v => v.decorations }
)