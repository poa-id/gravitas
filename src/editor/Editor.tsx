import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { gravitas } from './theme'
import { wikilinkPlugin } from './plugins/wikilinks'
import { openQuestionPlugin } from './plugins/openQuestions'
import { typewriterExtensions } from './plugins/typewriter'
import './Editor.css'

interface Note {
  title: string
  content: string
  meta: {
    date: string
    tags: string[]
    type: string
    words: number
  }
}

interface EditorProps {
  note: Note
  onNavOpen: () => void
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function readingTime(words: number): string {
  const mins = Math.ceil(words / 200)
  return mins < 1 ? '< 1 min' : `~${mins} min read`
}

export default function Editor({ note, onNavOpen }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [words, setWords] = useState(countWords(note.content))
  const [chars, setChars] = useState(note.content.length)
  const [uiVisible, setUiVisible] = useState(false)
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isTyping = useRef(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const showUI = (e: React.MouseEvent) => {
    // Only show UI on genuine mouse movement, not keyboard-triggered repaints
    if (e.movementX === 0 && e.movementY === 0) return
    setUiVisible(true)
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 2500)
  }

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: note.content,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        gravitas,
        wikilinkPlugin,
        openQuestionPlugin,
        ...typewriterExtensions,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            const text = update.state.doc.toString()
            setWords(countWords(text))
            setChars(text.length)
          }
        }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
      dispatchTransactions(trs) {
        const filtered = trs.map(tr => {
          if (tr.scrollIntoView && !tr.docChanged) {
            return tr.state.update({ scrollIntoView: false })
          }
          return tr
        })
        view.update(filtered)
      }
    })

    viewRef.current = view
    view.focus()

    return () => view.destroy()
  }, [])

  return (
    <div
      className={`gv-editor ${uiVisible ? 'ui-visible' : ''}`}
      onMouseMove={showUI}
    >
      <div className="gv-topbar">
        <button className="gv-nav-toggle" onClick={onNavOpen} title="Navigate">
          <span /><span /><span />
        </button>
        <div className="gv-topbar-actions">
          <span className="gv-mode-tab active">Write</span>
          <span className="gv-mode-tab">Read</span>
          <span className="gv-mode-tab">Audit</span>
        </div>
      </div>

      <div className="gv-stage">
        <div className="gv-col">
          <div className="gv-header">
            <h1 className="gv-title">{note.title}</h1>
            <div className="gv-meta">
              <span>{note.meta.date}</span>
              {note.meta.tags.map(t => (
                <span key={t} className="gv-tag">{t}</span>
              ))}
              <span className="gv-type-badge">{note.meta.type}</span>
            </div>
          </div>
          <div className="gv-cm-wrap" ref={editorRef} />
        </div>
      </div>

      <div className="gv-statusbar">
        <span className="gv-stat">
          <span className="gv-stat-dot" />
          Not set
        </span>
        <span className="gv-stat">{words} words</span>
        <span className="gv-stat">{chars} chars</span>
        <span className="gv-stat">{readingTime(words)}</span>
      </div>
    </div>
  )
}
