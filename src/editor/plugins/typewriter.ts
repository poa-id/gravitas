import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'

// Target position from top of viewport
// 0.62 = cursor sits at 62% from top — more text above, breathing room below
const TARGET_RATIO = 0.62

export function createTypewriterDispatch(view: EditorView) {
  return function(trs: readonly any[]) {
    // Strip scrollIntoView from any transaction that doesn't change the document
    const processed = trs.map(tr => {
      if (tr.scrollIntoView && !tr.docChanged) {
        return view.state.update({ 
          ...tr, 
          scrollIntoView: false 
        })
      }
      return tr
    })
    EditorView.prototype.update.call(view, processed)
  }
}

function scrollToCursor(view: EditorView) {
  const head = view.state.selection.main.head
  const coords = view.coordsAtPos(head, 1)
  if (!coords) return

  const scroller = view.scrollDOM
  const rect = scroller.getBoundingClientRect()
  const lineMiddle = (coords.top + coords.bottom) / 2
  const lineRelative = lineMiddle - rect.top
  const absolutePos = scroller.scrollTop + lineRelative

  // Soft top: near start of document don't force down
  if (absolutePos < rect.height * TARGET_RATIO) return

  const delta = lineRelative - rect.height * TARGET_RATIO
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta)
}

export const typewriterExtensions = [
  ViewPlugin.fromClass(
    class {
      private pending: number | null = null

      constructor(private view: EditorView) {}

      update(update: ViewUpdate) {
        if (!update.docChanged) return
        if (this.pending !== null) cancelAnimationFrame(this.pending)
        this.pending = requestAnimationFrame(() => {
          this.pending = null
          scrollToCursor(this.view)
        })
      }

      destroy() {
        if (this.pending !== null) cancelAnimationFrame(this.pending)
      }
    }
  ),
  EditorView.theme({
    '.cm-scroller': {
      paddingBottom: '50vh !important',
    },
  }),
]