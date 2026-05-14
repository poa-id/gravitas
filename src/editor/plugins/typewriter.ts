import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { EditorState, Transaction } from '@codemirror/state'

const TARGET_RATIO = 0.62

function scrollToCursor(view: EditorView) {
  const head = view.state.selection.main.head
  const coords = view.coordsAtPos(head, 1)
  if (!coords) return

  const scroller = view.scrollDOM
  const rect = scroller.getBoundingClientRect()
  const lineMiddle = (coords.top + coords.bottom) / 2
  const lineRelative = lineMiddle - rect.top
  const absolutePos = scroller.scrollTop + lineRelative

  if (absolutePos < rect.height * (1 - TARGET_RATIO)) return

  const delta = lineRelative - rect.height * (1 - TARGET_RATIO)
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta)
}

export const typewriterExtensions = [
  EditorState.transactionFilter.of(tr => {
    if (!tr.scrollIntoView) return tr
    if (tr.docChanged) return tr // let typing through — our plugin handles it

    // Check if this is a keyboard move or a mouse click
    const userEvent = tr.annotation(Transaction.userEvent)
    const isKeyboard = userEvent?.startsWith('select') && !userEvent.includes('pointer')
    const isMouse = userEvent?.includes('pointer') || userEvent?.includes('click')

    if (isMouse) {
      // Mouse click — suppress scroll entirely
      return [{ ...tr, scrollIntoView: false }]
    }

    if (isKeyboard) {
      // Keyboard navigation — allow but we'll handle it ourselves
      return [{ ...tr, scrollIntoView: false }]
    }

    // Unknown — suppress to be safe
    return [{ ...tr, scrollIntoView: false }]
  }),

  ViewPlugin.fromClass(
    class {
      private pending: number | null = null

      constructor(private view: EditorView) {}

      update(update: ViewUpdate) {
        if (update.docChanged) {
          // Typing — center the cursor
          if (this.pending !== null) cancelAnimationFrame(this.pending)
          this.pending = requestAnimationFrame(() => {
            this.pending = null
            scrollToCursor(this.view)
          })
          return
        }

        if (update.selectionSet) {
          // Check if this was keyboard navigation
          const isKeyboard = update.transactions.some(tr => {
            const event = tr.annotation(Transaction.userEvent)
            return event?.startsWith('select') && !event.includes('pointer')
          })

          if (isKeyboard) {
            if (this.pending !== null) cancelAnimationFrame(this.pending)
            this.pending = requestAnimationFrame(() => {
              this.pending = null
              scrollToCursor(this.view)
            })
          }
          // Mouse click — do nothing, let user look where they want
        }
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