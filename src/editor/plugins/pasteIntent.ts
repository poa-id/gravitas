import { ViewPlugin, ViewUpdate } from '@codemirror/view'
import { EditorView } from '@codemirror/view'

let lastInternalCopy: string | null = null

function wrapAsQuote(text: string): string {
  return text.split('\n').map(line => `> ${line}`).join('\n')
}

function wrapAsProcess(text: string): string {
  return text.split('\n').map(line => `>> ${line}`).join('\n')
}

export type PasteIntentState = { active: false } | { active: true }
export type OnBannerChange = (state: PasteIntentState) => void

export function createPasteIntentPlugin(onBannerChange: OnBannerChange, isEnabled: { current: boolean }) {
  class PasteIntentPlugin {
    private pendingText: string | null = null
    private pendingFrom = 0
    private pendingTo = 0
    private intentListener: ((e: KeyboardEvent) => void) | null = null

    constructor(private view: EditorView) {
      view.dom.addEventListener('copy', this.handleCopy)
      view.dom.addEventListener('cut', this.handleCopy)
    }

    handleCopy = () => {
      const sel = window.getSelection()
      if (sel) lastInternalCopy = sel.toString()
    }

    handlePaste = (e: ClipboardEvent) => {
      if (!isEnabled.current) return
      const text = e.clipboardData?.getData('text/plain')
      if (!text?.trim()) return

      // Skip intra-app paste
      if (lastInternalCopy !== null && text === lastInternalCopy) return

      e.preventDefault()
      e.stopPropagation()

      // Reset any previous pending state
      this.clearIntent()

      const { from, to } = this.view.state.selection.main
      this.pendingText = text
      this.pendingFrom = from
      this.pendingTo = to

      onBannerChange({ active: true })

      // Use a short delay so this listener doesn't catch the paste's own
      // keyup or any trailing events from the ⌘V keypress
      setTimeout(() => {
        this.intentListener = (e: KeyboardEvent) => {
          // Ignore bare modifiers
          if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
          e.preventDefault()
          e.stopPropagation()
          this.resolveIntent(e.key)
        }
        document.addEventListener('keydown', this.intentListener, {
          capture: true,
          once: true,
        })
      }, 50)
    }

    resolveIntent(key: string) {
      if (!this.pendingText) return

      const text = this.pendingText
      const from = this.pendingFrom
      const to = this.pendingTo

      const k = key.toLowerCase()
      let insert: string

      if (k === 'q') {
        insert = wrapAsQuote(text)
      } else if (k === 'p') {
        insert = wrapAsProcess(text)
      } else {
        insert = text
      }

      // Append \n\n to break out of blockquote auto-continuation
      const insertWithBreak = insert + '\n\n'

      this.view.dispatch({
        changes: { from, to, insert: insertWithBreak },
        selection: { anchor: from + insertWithBreak.length },
        userEvent: 'input.paste.intent',
      })

      this.clearIntent()
      this.view.focus()
    }

    clearIntent() {
      if (this.intentListener) {
        document.removeEventListener('keydown', this.intentListener, { capture: true })
        this.intentListener = null
      }
      this.pendingText = null
      this.pendingFrom = 0
      this.pendingTo = 0
      onBannerChange({ active: false })
    }

    update(_update: ViewUpdate) {}

    destroy() {
      this.view.dom.removeEventListener('copy', this.handleCopy)
      this.view.dom.removeEventListener('cut', this.handleCopy)
      this.clearIntent()
    }
  }

  return ViewPlugin.fromClass(PasteIntentPlugin, {
    eventHandlers: {
      paste(e: ClipboardEvent) {
        this.handlePaste(e)
      },
    },
  })
}
