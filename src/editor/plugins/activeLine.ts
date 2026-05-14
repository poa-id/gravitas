import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

const activeLineDeco = Decoration.line({ class: 'cm-gravitas-active' })

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
      const line = view.state.doc.lineAt(selection.head)

      // Only apply scaling if the line is short — won't wrap
      // Threshold: 80 chars fits in our column without wrapping
      if (line.length <= 80) {
        builder.add(line.from, line.from, activeLineDeco)
      }

      return builder.finish()
    }
  },
  { decorations: v => v.decorations }
)