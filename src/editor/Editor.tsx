import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { gravitas } from './theme'
import { wikilinkPlugin } from './plugins/wikilinks'
import { openQuestionPlugin } from './plugins/openQuestions'
import { typewriterExtensions, setProgrammatic } from './plugins/typewriter'
import { activeLineScaling } from './plugins/activeLine'
import { playKeySound } from './plugins/typewriterSound'
import './Editor.css'

interface Note {
  title: string
  path: string
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
  onContentChange?: (content: string) => void
  saveState?: 'set' | 'setting' | 'unsaved'
  soundEnabled?: boolean
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function readingTime(words: number): string {
  const mins = Math.ceil(words / 200)
  return mins < 1 ? '< 1 min' : `~${mins} min read`
}

export default function Editor({
  note,
  onNavOpen,
  onContentChange,
  saveState = 'set',
  soundEnabled = false
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [words, setWords] = useState(countWords(note.content))
  const [chars, setChars] = useState(note.content.length)
  const [uiVisible, setUiVisible] = useState(false)
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeKeyRef = useRef<string>('')
  const soundEnabledRef = useRef(soundEnabled)

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  const showUI = (e: React.MouseEvent) => {
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
        activeLineScaling,
        ...typewriterExtensions,
        EditorView.domEventHandlers({
          keydown(e) {
            if (!soundEnabledRef.current) return false
            if (
              e.key.length === 1 ||
              e.key === 'Enter' ||
              e.key === 'Backspace' ||
              e.key === 'Delete'
            ) {
              playKeySound()
            }
            return false
          }
        }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            const text = update.state.doc.toString()
            setWords(countWords(text))
            setChars(text.length)
            onContentChange?.(text)
          }
        }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view
    activeKeyRef.current = note.path
    view.focus()

    return () => view.destroy()
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    if (note.path === activeKeyRef.current) return

    activeKeyRef.current = note.path

    // Disable typewriter during programmatic content swap
    setProgrammatic(true)

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: note.content,
      },
      scrollIntoView: false,
    })

    setWords(countWords(note.content))
    setChars(note.content.length)

    requestAnimationFrame(() => {
      const endPos = view.state.doc.length
      view.dispatch({
        selection: { anchor: endPos },
        scrollIntoView: false,
      })
      view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight

      // Release programmatic lock after settling
      requestAnimationFrame(() => {
        setProgrammatic(false)
        view.focus()
      })
    })

  }, [note.path, note.content])

  const saveLabel = saveState === 'set'
    ? 'Set'
    : saveState === 'setting'
    ? 'Setting…'
    : 'Not set'

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
          <span className={`gv-stat-dot ${saveState}`} />
          {saveLabel}
        </span>
        <span className="gv-stat">{words} words</span>
        <span className="gv-stat">{chars} chars</span>
        <span className="gv-stat">{readingTime(words)}</span>
      </div>
    </div>
  )
}