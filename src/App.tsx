import './styles.css'
import { useState, useEffect, useRef } from 'react'
import Editor from './editor/Editor'
import Nav from './ui/Nav'
import EmptyState from './ui/EmptyState'
import { open } from '@tauri-apps/plugin-dialog'
import { loadWorkshop, ensureTodayFolio, readNote, writeNote, type Workshop, type NoteFile } from './workshop/workshopAdapter'
import { getPreferences, setPreference, addKnownWorkshop } from './workshop/preferences'
import { createNewNote } from './workshop/noteCreation'
import { initSound } from './editor/plugins/typewriterSound'

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

function formatNoteTitle(note: NoteFile): string {
  const dateMatch = note.name.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateMatch) {
    const d = new Date(note.name + 'T12:00:00')
    return d.toLocaleDateString('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }
  return note.name
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
    : note.shelf.includes('scratch')
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

  useEffect(() => {
    initSound()
  }, [])

  // Keep ref in sync with state for use inside event listeners
  useEffect(() => {
    workshopRef.current = workshop
  }, [workshop])

  const refreshWorkshop = async (path: string) => {
    const ws = await loadWorkshop(path)
    setWorkshop(ws)
    return ws
  }

  useEffect(() => {
    async function resumeLastSession() {
      try {
        const prefs = await getPreferences()
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

  // Refresh nav when it opens
  useEffect(() => {
    if (!navOpen || !workshop) return
    refreshWorkshop(workshop.path).catch(console.error)
  }, [navOpen])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const ws = workshopRef.current
      if (!ws) return

      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        try {
          const note = await createNewNote(ws.path, ['scratch'])
          const content = ''
          setActiveNote(note)
          setNoteContent(content)
          setSaveState('unsaved')
          await setPreference('lastNotePath', note.path)
          await refreshWorkshop(ws.path)
        } catch (err) {
          console.error('Failed to create note:', err)
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setNavOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleOpen = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open a workshop',
    })

    if (selected && typeof selected === 'string') {
      try {
        const ws = await loadWorkshop(selected)
        const todayFolio = await ensureTodayFolio(selected)
        setWorkshop(ws)
        setWorkshopOpen(true)
        await setPreference('lastWorkshopPath', selected)
        await addKnownWorkshop(selected)

        const content = await readNote(todayFolio.path)
        setActiveNote(todayFolio)
        setNoteContent(content)
        await setPreference('lastNotePath', todayFolio.path)
      } catch (err) {
        console.error('Failed to open workshop:', err)
      }
    }
  }

  const handleNoteSelect = async (note: NoteFile) => {
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

  const handleContentChange = (content: string) => {
    setSaveState('setting')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!activeNote) return
      try {
        await writeNote(activeNote.path, content)
        setSaveState('set')
      } catch (err) {
        console.error('Failed to save:', err)
        setSaveState('unsaved')
      }
    }, 800)
  }

  if (loading) return null

  if (!workshopOpen || !workshop) {
    return <EmptyState onOpen={handleOpen} />
  }

  return (
    <div className="app">
      <Nav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onNoteSelect={handleNoteSelect}
        workshop={workshop}
      />
      <Editor
        note={activeNote ? {
          title: formatNoteTitle(activeNote),
          path: activeNote.path,
          content: noteContent || '',
          meta: formatNoteMeta(activeNote),
        } : DEMO_NOTE}
        onNavOpen={() => setNavOpen(true)}
        onContentChange={handleContentChange}
        saveState={saveState}
      />
    </div>
  )
}