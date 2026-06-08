import './styles.css'
import { useState, useEffect, useRef } from 'react'
import Editor, { type EditorHandle } from './editor/Editor'
import Nav from './ui/Nav'
import EmptyState from './ui/EmptyState'
import { open } from '@tauri-apps/plugin-dialog'
import {
  loadWorkshop, ensureTodayFolio, ensureScratch, readNote, writeNote,
  type Workshop, type NoteFile,
} from './workshop/workshopAdapter'
import { getPreferences, setPreference, addKnownWorkshop } from './workshop/preferences'
import { createNewNote, renameNoteOnDisk } from './workshop/noteCreation'
import { warmup as warmupSound } from './editor/plugins/typewriterSound'
import { invalidateSignalCache } from './ui/Nav'
import Prefs from './ui/Prefs'

const DEMO_NOTE = {
  title: 'Welcome to Gravitas',
  path: '__demo__',
  content: `## What you can do here

Write freely. This is your workshop — a place where raw thought becomes shaped work.

### Text and emphasis

You can write in **bold** when something carries weight, or in *italics* when a word needs to lean. Use \`inline code\` for technical terms or precise references.

### Wikilinks and marks

Connect thoughts with [[wikilinks]] — type [[ and the name of any note. Mark ideas inline with #craft or #oficio. Links and marks are the nervous system of your workshop.

### Catch

Open a scratch note instantly with the catch shortcut. No file name, no shelf, no decisions. The thought lands safely and waits for you.

### Open questions

?? What makes a tool feel like it belongs to you?

Lines starting with ?? become open questions — collected across your whole workshop, never lost.

### Blockquotes

> The details are not the details. They make the design. — Charles Eames

### Code

\`\`\`
function gravitas() {
  return presence + weight + calm
}
\`\`\`

---

The best writing sessions begin with a single line you almost didn't type.`,
  meta: {
    date: 'May 2026',
    tags: ['#welcome'],
    type: 'note',
    words: 0,
  }
}

function localDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatNoteTitle(note: NoteFile): string {
  const dateMatch = note.name.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const today = localDateStr(new Date())
    const yesterday = localDateStr(new Date(Date.now() - 86400000))
    if (note.name === today) return 'Today'
    if (note.name === yesterday) return 'Yesterday'
    const d = new Date(note.name + 'T12:00:00')
    return d.toLocaleDateString('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }
  const words = note.name.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatNoteMeta(note: NoteFile) {
  const dateMatch = note.name.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = dateMatch
    ? new Date(note.name + 'T12:00:00').toLocaleDateString('en', {
        month: 'short', day: 'numeric', year: 'numeric'
      })
    : new Date().toLocaleDateString('en', { month: 'short', year: 'numeric' })

  const type = note.shelf.includes('folio')
    ? 'folio'
    : note.name === 'scratch' && note.shelf.length === 0
    ? 'scratch'
    : 'note'

  return { date, tags: [], type, words: 0 }
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [workshopOpen, setWorkshopOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [workshop, setWorkshop] = useState<Workshop | null>(null)
  const [activeNote, setActiveNote] = useState<NoteFile | null>(null)
  const [noteContent, setNoteContent] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'set' | 'setting' | 'unsaved'>('set')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workshopRef = useRef<Workshop | null>(null)
  const activeNoteRef = useRef<NoteFile | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const [noteTitles, setNoteTitles] = useState<Map<string, string>>(new Map())
  const [isNewNote, setIsNewNote] = useState(false)
  const [showScratchToast, setShowScratchToast] = useState(false)
  const [toastDismissing, setToastDismissing] = useState(false)
  const editorRef = useRef<EditorHandle>(null)

  const setNoteTitle = (path: string, title: string) => {
    setNoteTitles(prev => new Map(prev).set(path, title))
  }
  const clearNoteTitle = (path: string) => {
    setNoteTitles(prev => { const next = new Map(prev); next.delete(path); return next })
  }

  const [prefsOpen, setPrefsOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [pasteIntentEnabled, setPasteIntentEnabled] = useState(true)

  useEffect(() => { warmupSound() }, [])
  useEffect(() => { workshopRef.current = workshop }, [workshop])
  useEffect(() => { activeNoteRef.current = activeNote }, [activeNote])

  // Midnight rollover
  useEffect(() => {
    const scheduleRollover = () => {
      const now = new Date()
      const msUntilMidnight =
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()

      const timer = setTimeout(async () => {
        const ws = workshopRef.current
        if (!ws) return
        try {
          const folio = await ensureTodayFolio(ws.path)
          const content = await readNote(folio.path)
          setActiveNote(folio)
          setNoteContent(content)
          setSaveState('set')
          await setPreference('lastNotePath', folio.path)
          await refreshWorkshop(ws.path)
        } catch (err) {
          console.error('Midnight rollover failed:', err)
        }
        scheduleRollover()
      }, msUntilMidnight + 1000)

      return timer
    }

    const timer = scheduleRollover()
    return () => clearTimeout(timer)
  }, [])

  const refreshWorkshop = async (path: string) => {
    const ws = await loadWorkshop(path)
    setWorkshop(ws)
    return ws
  }

  const flushSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (pendingContentRef.current !== null && activeNoteRef.current) {
      try {
        await writeNote(activeNoteRef.current.path, pendingContentRef.current)
        setSaveState('set')
        pendingContentRef.current = null
      } catch (err) {
        console.error('Failed to flush save:', err)
      }
    }
  }

  const showToastOnce = async () => {
    const prefs = await getPreferences()
    if (prefs.seenScratchToast) return
    await setPreference('seenScratchToast', true)
    setShowScratchToast(true)
    setTimeout(() => {
      setToastDismissing(true)
      setTimeout(() => {
        setShowScratchToast(false)
        setToastDismissing(false)
      }, 200)
    }, 4000)
  }

  useEffect(() => {
    async function resumeLastSession() {
      try {
        const prefs = await getPreferences()
        setSoundEnabled(prefs.soundEnabled !== false)
        setPasteIntentEnabled(prefs.pasteIntentEnabled !== false)
        if (!prefs.lastWorkshopPath) {
          setLoading(false)
          return
        }

        const ws = await loadWorkshop(prefs.lastWorkshopPath)
        setWorkshop(ws)
        setWorkshopOpen(true)

        if (prefs.onOpen === 'resume' && prefs.lastNotePath) {
          try {
            const content = await readNote(prefs.lastNotePath)
            const noteName = prefs.lastNotePath.split('/').pop()?.replace('.md', '') || ''
            const noteShelf = prefs.lastNotePath
              .replace(prefs.lastWorkshopPath + '/', '')
              .split('/')
              .slice(0, -1)
            setActiveNote({ name: noteName, path: prefs.lastNotePath, shelf: noteShelf })
            setNoteContent(content)
          } catch {
            const folio = await ensureTodayFolio(prefs.lastWorkshopPath)
            const content = await readNote(folio.path)
            setActiveNote(folio)
            setNoteContent(content)
          }
        } else {
          const folio = await ensureTodayFolio(prefs.lastWorkshopPath)
          const content = await readNote(folio.path)
          setActiveNote(folio)
          setNoteContent(content)
        }
      } catch (err) {
        console.error('Failed to resume session:', err)
      } finally {
        setLoading(false)
      }
    }

    resumeLastSession()
  }, [])

  useEffect(() => {
    if (!navOpen || !workshop) return
    refreshWorkshop(workshop.path).catch(console.error)
  }, [navOpen])

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const ws = workshopRef.current

      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setPrefsOpen(prev => !prev)
      }

      if (!ws) return

      // ⌘S — new scratch entry
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()

        const now = new Date()
        const datePart = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const timePart = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        const divider = `\n§ ${datePart} · ${timePart}\n\n`

        const isScratchNow = activeNoteRef.current?.shelf.length === 0
          && activeNoteRef.current?.name === 'scratch'

        if (isScratchNow) {
          // Dispatch directly into the CM6 editor
          editorRef.current?.appendEntry(divider)
        } else {
          // Switch to scratch, pre-appending the new entry
          await flushSave()
          const scratch = await ensureScratch(ws.path)
          const existing = await readNote(scratch.path).catch(() => '')
          const newContent = existing + divider
          await writeNote(scratch.path, newContent)
          setActiveNote(scratch)
          setNoteContent(newContent)
          setSaveState('set')
          await setPreference('lastNotePath', scratch.path)
          await refreshWorkshop(ws.path)
        }

        showToastOnce()
        return
      }

      // ⌘N — new named note on workshop floor
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        await flushSave()
        try {
          const note = await createNewNote(ws.path, [])  // workshop floor, no shelf
          setActiveNote(note)
          setNoteContent('')
          setSaveState('unsaved')
          setIsNewNote(true)
          await setPreference('lastNotePath', note.path)
          await refreshWorkshop(ws.path)
        } catch (err) {
          console.error('Failed to create note:', err)
        }
        return
      }

      // ⌘D — today's folio
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        await flushSave()
        try {
          const folio = await ensureTodayFolio(ws.path)
          const content = await readNote(folio.path)
          setActiveNote(folio)
          setNoteContent(content)
          setSaveState('set')
          await setPreference('lastNotePath', folio.path)
          await refreshWorkshop(ws.path)
        } catch (err) {
          console.error('Failed to open folio:', err)
        }
        return
      }

      // ⌘K — nav toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setNavOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleWorkshopChange = async (path: string) => {
    try {
      const ws = await loadWorkshop(path)
      setWorkshop(ws)
      setWorkshopOpen(true)
      await setPreference('lastWorkshopPath', path)
      await addKnownWorkshop(path)
      const folio = await ensureTodayFolio(path)
      const content = await readNote(folio.path)
      setActiveNote(folio)
      setNoteContent(content)
      await setPreference('lastNotePath', folio.path)
    } catch (err) {
      console.error('Failed to switch workshop:', err)
    }
  }

  const handleNoteDeleted = async (note: NoteFile) => {
    const ws = workshopRef.current
    if (!ws) return

    if (activeNoteRef.current?.path === note.path) {
      try {
        const folio = await ensureTodayFolio(ws.path)
        const content = await readNote(folio.path)
        setActiveNote(folio)
        setNoteContent(content)
        setSaveState('set')
        await setPreference('lastNotePath', folio.path)
      } catch (err) {
        console.error('Failed to open folio after delete:', err)
      }
    }

    await refreshWorkshop(ws.path)
  }

  const handleNoteMoved = async (oldNote: NoteFile, newNote: NoteFile) => {
    if (activeNoteRef.current?.path === oldNote.path) {
      setActiveNote(newNote)
      activeNoteRef.current = newNote
      await setPreference('lastNotePath', newNote.path)
    }
    const ws = workshopRef.current
    if (ws) await refreshWorkshop(ws.path)
  }

  const handleRenamed = async (oldNote: NoteFile, newNote: NoteFile, humanTitle?: string) => {
    clearNoteTitle(oldNote.path)
    if (humanTitle) setNoteTitle(newNote.path, humanTitle)
    if (activeNoteRef.current?.path === oldNote.path) {
      setActiveNote(newNote)
      activeNoteRef.current = newNote
      await setPreference('lastNotePath', newNote.path)
    }
    const ws = workshopRef.current
    if (ws) await refreshWorkshop(ws.path)
  }

  const handleOpen = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open a workshop',
    })

    if (selected && typeof selected === 'string') {
      try {
        const ws = await loadWorkshop(selected)
        setWorkshop(ws)
        setWorkshopOpen(true)
        await setPreference('lastWorkshopPath', selected)
        await addKnownWorkshop(selected)

        if (ws.allNotes.length > 0) {
          const recent = ws.allNotes[0]
          const content = await readNote(recent.path)
          setActiveNote(recent)
          setNoteContent(content)
          await setPreference('lastNotePath', recent.path)
        }
      } catch (err) {
        console.error('Failed to open workshop:', err)
      }
    }
  }

  const handleNoteSelect = async (note: NoteFile) => {
    await flushSave()
    try {
      const content = await readNote(note.path)
      setActiveNote(note)
      setNoteContent(content)
      setSaveState('set')
      await setPreference('lastNotePath', note.path)
    } catch (err) {
      console.error('Failed to read note:', err)
    }
  }

  const handleTodayFolio = async () => {
    if (!workshop) return
    await flushSave()
    try {
      const folio = await ensureTodayFolio(workshop.path)
      const content = await readNote(folio.path)
      setActiveNote(folio)
      setNoteContent(content)
      setSaveState('set')
      await setPreference('lastNotePath', folio.path)
      await refreshWorkshop(workshop.path)
    } catch (err) {
      console.error('Failed to open today folio:', err)
    }
  }

  const handleScratchOpen = async () => {
    if (!workshop) return
    await flushSave()
    const now = new Date()
    const datePart = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const timePart = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const divider = `\n§ ${datePart} · ${timePart}\n\n`
    const scratch = await ensureScratch(workshop.path)
    const existing = await readNote(scratch.path).catch(() => '')
    const newContent = existing + divider
    await writeNote(scratch.path, newContent)
    setActiveNote(scratch)
    setNoteContent(newContent)
    setSaveState('set')
    await setPreference('lastNotePath', scratch.path)
    await refreshWorkshop(workshop.path)
    showToastOnce()
  }

  const handleContentChange = (content: string) => {
    setSaveState('setting')
    pendingContentRef.current = content
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!activeNoteRef.current) return
      try {
        await writeNote(activeNoteRef.current.path, content)
        invalidateSignalCache(activeNoteRef.current.path)
        setSaveState('set')
        pendingContentRef.current = null
      } catch (err) {
        console.error('Failed to save:', err)
        setSaveState('unsaved')
      }
    }, 800)
  }

  const handleTitleChange = async (newTitle: string) => {
    const ws = workshopRef.current
    const note = activeNoteRef.current
    if (!ws || !note) return
    if (note.shelf.includes('folio')) return

    try {
      const renamed = await renameNoteOnDisk(note, newTitle, ws.path)
      if (!renamed) return

      setNoteTitle(renamed.path, newTitle)
      setActiveNote(renamed)
      activeNoteRef.current = renamed
      await setPreference('lastNotePath', renamed.path)
      await refreshWorkshop(ws.path)
    } catch (err) {
      console.error('Failed to rename note:', err)
    }
  }

  // Promote: create a new floor note with scratch entry content, insert marker
  const handlePromote = async (content: string, insertAfterPos: number) => {
    const ws = workshopRef.current
    if (!ws) return
    try {
      // Insert §promoted marker into scratch at the given position
      editorRef.current?.insertAt(insertAfterPos, '§promoted\n')

      // Create a new floor note with the entry content
      const note = await createNewNote(ws.path, [])
      await writeNote(note.path, content)

      setActiveNote(note)
      setNoteContent(content)
      setSaveState('set')
      setIsNewNote(true)
      await setPreference('lastNotePath', note.path)
      await refreshWorkshop(ws.path)
    } catch (err) {
      console.error('Failed to promote scratch entry:', err)
    }
  }

  if (loading) return null

  if (!workshopOpen || !workshop) {
    return <EmptyState onOpen={handleOpen} />
  }

  const isScratch = activeNote?.shelf.length === 0 && activeNote?.name === 'scratch'

  return (
    <div className="app">
      <Nav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNoteSelect={handleNoteSelect}
        onTodayFolio={handleTodayFolio}
        onScratchOpen={handleScratchOpen}
        workshop={workshop}
        onNoteDeleted={handleNoteDeleted}
        onNoteMoved={handleNoteMoved}
        onRenamed={handleRenamed}
        onRefresh={async () => { await refreshWorkshop(workshop.path) }}
        noteTitles={noteTitles}
      />

      <Editor
        ref={editorRef}
        note={activeNote ? {
          title: noteTitles.get(activeNote.path) ?? formatNoteTitle(activeNote),
          path: activeNote.path,
          content: noteContent || '',
          meta: formatNoteMeta(activeNote),
        } : DEMO_NOTE}
        onNavOpen={() => setNavOpen(true)}
        onContentChange={handleContentChange}
        onTitleChange={activeNote && !activeNote.shelf.includes('folio') && activeNote.name !== 'scratch'
          ? handleTitleChange
          : undefined
        }
        saveState={saveState}
        soundEnabled={soundEnabled}
        pasteIntentEnabled={pasteIntentEnabled}
        isScratch={isScratch ?? false}
        isNewNote={isNewNote}
        onNewNoteDone={() => setIsNewNote(false)}
        onPromote={handlePromote}
      />

      {showScratchToast && (
        <div className={`gv-toast ${toastDismissing ? 'dismissing' : ''}`}>
          your work is always saved. &nbsp; ⌘S opens a new scratch entry.
        </div>
      )}

      <Prefs
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        onWorkshopChange={handleWorkshopChange}
        onSoundChange={setSoundEnabled}
        onPasteIntentChange={setPasteIntentEnabled}
      />
    </div>
  )
}
