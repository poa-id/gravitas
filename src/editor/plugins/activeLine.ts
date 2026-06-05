import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// Opacity falloff by logical line distance from cursor
// Distance 0 = cursor line, 1 = adjacent, etc.
const OPACITY_BY_DISTANCE: Record<number, number> = {
  0: 1.0,
  1: 0.9,
  2: 0.82,
  3: 0.7,
}
const OPACITY_FAR = 0.6 // anything beyond distance 3

function opacityForDistance(dist: number): number {
  return OPACITY_BY_DISTANCE[dist] ?? OPACITY_FAR
}

// Cache decoration instances — one per distinct opacity value
const decoCache = new Map<number, Decoration>()

function lineDecoration(opacity: number): Decoration {
  const key = Math.round(opacity * 100)
  if (!decoCache.has(key)) {
    decoCache.set(
      key,
      Decoration.line({
        attributes: { style: `opacity: ${opacity}` },
      })
    )
  }
  return decoCache.get(key)!
}

export const focusGradient = ViewPlugin.fromClass(
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
      const activeLine = view.state.doc.lineAt(view.state.selection.main.head)

      for (let i = 1; i <= view.state.doc.lines; i++) {
        const line = view.state.doc.line(i)
        const dist = Math.abs(line.number - activeLine.number)
        const opacity = opacityForDistance(dist)
        builder.add(line.from, line.from, lineDecoration(opacity))
      }

      return builder.finish()
    }
  },
  { decorations: v => v.decorations }
)