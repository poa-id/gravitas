import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { EditorView, keymap, ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { gravitas } from './theme'
import { wikilinkPlugin } from './plugins/wikilinks'
import { openQuestionPlugin } from './plugins/openQuestions'
import { typewriterExtensions, setProgrammatic } from './plugins/typewriter'
import { focusGradient } from './plugins/activeLine'
import { playKeySound } from './plugins/typewriterSound'
import { markdownRenderPlugin } from './plugins/markdownRender'
import { createPasteIntentPlugin } from './plugins/pasteIntent'
import { processBlockPlugin } from './plugins/processBlock'
import { createScratchPromotePlugin, scratchReadonlyExtension } from './plugins/scratchPromote'
import './pasteBanner.css'
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

export interface EditorHandle {
  appendEntry: (text: string) => void
  insertAt: (pos: number, text: string) => void
}

interface EditorProps {
  note: Note
  onNavOpen: () => void
  onContentChange?: (content: string) => void
  onTitleChange?: (newTitle: string) => void
  saveState?: 'set' | 'setting' | 'unsaved'
  soundEnabled?: boolean
  pasteIntentEnabled?: boolean
  isScratch?: boolean
  isNewNote?: boolean
  onNewNoteDone?: () => void
  onPromote?: (content: string, insertAfterPos: number) => void
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function readingTime(words: number): string {
  const mins = Math.ceil(words / 200)
  return mins < 1 ? '< 1 min' : `~${mins} min read`
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  note,
  onNavOpen,
  onContentChange,
  onTitleChange,
  saveState = 'set',
  soundEnabled = false,
  pasteIntentEnabled = true,
  isScratch = false,
  isNewNote = false,
  onNewNoteDone,
  onPromote,
}, ref) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [words, setWords] = useState(countWords(note.content))
  const [chars, setChars] = useState(note.content.length)
  const [uiVisible, setUiVisible] = useState(false)
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeKeyRef = useRef<string>('')
  const soundEnabledRef = useRef(soundEnabled)
  const pasteIntentEnabledRef = useRef(pasteIntentEnabled)
  const isScratchRef = useRef(isScratch)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [pasteBannerVisible, setPasteBannerVisible] = useState(false)
  const [entering, setEntering] = useState(false)
  const onPromoteRef = useRef(onPromote)

  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])
  useEffect(() => { pasteIntentEnabledRef.current = pasteIntentEnabled }, [pasteIntentEnabled])
  useEffect(() => { isScratchRef.current = isScratch }, [isScratch])
  useEffect(() => { onPromoteRef.current = onPromote }, [onPromote])

  // Expose imperative handles to parent (App)
  useImperativeHandle(ref, () => ({
    appendEntry(text: string) {
      const view = viewRef.current
      if (!view) return
      const docLen = view.state.doc.length
      view.dispatch({
        changes: { from: docLen, insert: text },
        selection: { anchor: docLen + text.length },
        scrollIntoView: true,
      })
    },
    insertAt(pos: number, text: string) {
      const view = viewRef.current
      if (!view) return
      view.dispatch({
        changes: { from: pos, insert: text },
      })
    },
  }))

  const showUI = (e: React.MouseEvent) => {
    if (e.movementX === 0 && e.movementY === 0) return
    setUiVisible(true)
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
    uiTimerRef.current = setTimeout(() => setUiVisible(false), 2500)
  }

  const handleTitleClick = () => {
    if (!onTitleChange) return
    setTitleDraft(note.title)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  const handleTitleCommit = () => {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== note.title) {
      onTitleChange?.(trimmed)
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleCommit()
    if (e.key === 'Escape') setEditingTitle(false)
  }

  // Create paste plugin once
  const pastePluginRef = useRef<ReturnType<typeof createPasteIntentPlugin> | null>(null)
  if (!pastePluginRef.current) {
    pastePluginRef.current = createPasteIntentPlugin(
      (state) => setPasteBannerVisible(state.active),
      pasteIntentEnabledRef
    )
  }

  // Create promote plugin once (always registered; only active when doc has scratch entries)
  const promotePluginRef = useRef<ReturnType<typeof createScratchPromotePlugin> | null>(null)
  if (!promotePluginRef.current) {
    promotePluginRef.current = createScratchPromotePlugin(onPromoteRef)
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
        markdownRenderPlugin,
        processBlockPlugin,
        focusGradient,
        ...(pastePluginRef.current ? [pastePluginRef.current] : []),
        ...(promotePluginRef.current ? [promotePluginRef.current] : []),
        scratchReadonlyExtension(() => isScratchRef.current),
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
          },
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

    const endPos = view.state.doc.length
    view.dispatch({
      selection: { anchor: endPos },
      scrollIntoView: false,
    })
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight
    })

    view.focus()

    return () => view.destroy()
  }, [])

  // Note switch effect
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (note.path === activeKeyRef.current) return

    activeKeyRef.current = note.path
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

      requestAnimationFrame(() => {
        setProgrammatic(false)
        view.focus()
      })
    })

    // New note: trigger fade-in and auto-edit title
    if (isNewNote) {
      setEntering(true)
      const t = setTimeout(() => setEntering(false), 300)
      if (!isScratch) {
        setTitleDraft(note.title)
        setEditingTitle(true)
        setTimeout(() => titleInputRef.current?.select(), 80)
      }
      onNewNoteDone?.()
      return () => clearTimeout(t)
    }
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

      <div className={`gv-paste-banner ${pasteBannerVisible ? 'visible' : ''}`}>
        <span><span className="gv-paste-banner-key">Q</span> quote</span>
        <span className="gv-paste-banner-sep">·</span>
        <span><span className="gv-paste-banner-key">P</span> process</span>
        <span className="gv-paste-banner-sep">·</span>
        <span>any key plain</span>
      </div>

      <div className={`gv-stage ${entering ? 'gv-entering' : ''}`}>
        <div className="gv-col">
          <div className="gv-header">
            {isScratch ? (
              <div className="gv-scratch-label">scratch</div>
            ) : editingTitle ? (
              <input
                ref={titleInputRef}
                className="gv-title gv-title-input"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleTitleCommit}
                onKeyDown={handleTitleKeyDown}
              />
            ) : (
              <h1
                className={`gv-title ${onTitleChange ? 'gv-title-editable' : ''}`}
                onClick={handleTitleClick}
              >
                {note.title}
              </h1>
            )}
            {!isScratch && (
              <div className="gv-meta">
                <span>{note.meta.date}</span>
                {note.meta.tags.map(t => (
                  <span key={t} className="gv-tag">{t}</span>
                ))}
                <span className="gv-type-badge">{note.meta.type}</span>
              </div>
            )}
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
})

export default Editor
