import { useState, useEffect, useRef } from 'react'
import { readTextFile } from '@tauri-apps/plugin-fs'
import type { Workshop, NoteFile } from '../workshop/workshopAdapter'
import { showNoteContextMenu } from './contextMenu'
import { trashNote, moveNote, revealInFinder, createShelf, renameShelf, trashShelf } from '../workshop/fileManagement'
import { renameNoteOnDisk } from '../workshop/noteCreation'
import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu'
import type { Shelf } from '../workshop/workshopAdapter'
import './Nav.css'

interface NavProps {
  open: boolean
  onClose: () => void
  onNoteSelect: (note: NoteFile) => void
  onTodayFolio: () => void
  workshop: Workshop
  onNoteDeleted: (note: NoteFile) => void
  onNoteMoved: (note: NoteFile, newNote: NoteFile) => void
  onRenamed: (oldNote: NoteFile, newNote: NoteFile, humanTitle?: string) => void
  onRefresh: () => Promise<void>
  noteTitles: Map<string, string>
}

function localDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatFolioName(name: string): string {
  const today = localDateStr(new Date())
  const yesterday = localDateStr(new Date(Date.now() - 86400000))
  if (name === today) return 'Today'
  if (name === yesterday) return 'Yesterday'
  const d = new Date(name + 'T12:00:00')
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }
  return name
}

export function formatNoteName(name: string): string {
  const words = name.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

interface NoteSignals {
  hasQuestions: boolean
  hasProcess: boolean
}

const signalCache = new Map<string, NoteSignals>()

async function scanNote(path: string): Promise<NoteSignals> {
  if (signalCache.has(path)) return signalCache.get(path)!
  try {
    const content = await readTextFile(path)
    const lines = content.split('\n')
    const signals: NoteSignals = {
      hasQuestions: lines.some(l => l.startsWith('?? ')),
      hasProcess: lines.some(l => l.startsWith('>> ')),
    }
    signalCache.set(path, signals)
    return signals
  } catch {
    return { hasQuestions: false, hasProcess: false }
  }
}

export function invalidateSignalCache(path: string) {
  signalCache.delete(path)
}

function NoteSignalDots({ signals }: { signals: NoteSignals | null }) {
  if (!signals) return null
  return (
    <span className="gv-nav-signals">
      {signals.hasQuestions && (
        <span className="gv-nav-signal gv-nav-signal-q" title="Has open questions">?</span>
      )}
      {signals.hasProcess && (
        <span className="gv-nav-signal gv-nav-signal-p" title="Has text to process">&gt;&gt;</span>
      )}
    </span>
  )
}

// Module-level drag state — avoids React state updates during drag
let draggedNotePath: string | null = null

export default function Nav({
  open, onClose, onNoteSelect, onTodayFolio, workshop,
  onNoteDeleted, onNoteMoved, onRenamed, onRefresh, noteTitles,
}: NavProps) {
  const [search, setSearch] = useState('')
  const [signals, setSignals] = useState<Map<string, NoteSignals>>(new Map())
  const scanStarted = useRef(false)

  const [renamingNote, setRenamingNote] = useState<NoteFile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameCommittedRef = useRef(false)

  // Shelves are collapsed by default; paths added here are expanded
  const [expandedShelves, setExpandedShelves] = useState<Set<string>>(new Set())
  const [folioExpanded, setFolioExpanded] = useState(false)

  // Shelf inline rename
  const [renamingShelf, setRenamingShelf] = useState<string | null>(null) // shelf.path
  const [renameShelfValue, setRenameShelfValue] = useState('')
  const renameShelfInputRef = useRef<HTMLInputElement>(null)
  const renameShelfCommittedRef = useRef(false)

  const [newShelfMode, setNewShelfMode] = useState(false)
  const [newShelfName, setNewShelfName] = useState('')
  const newShelfInputRef = useRef<HTMLInputElement>(null)

  // Track which shelf is being dragged over
  const [dragOverShelf, setDragOverShelf] = useState<string | null>(null)

  useEffect(() => {
    if (renamingNote && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingNote])

  useEffect(() => {
    if (newShelfMode && newShelfInputRef.current) {
      newShelfInputRef.current.focus()
    }
  }, [newShelfMode])

  useEffect(() => {
    if (!open || scanStarted.current) return
    scanStarted.current = true
    const notes = workshop.allNotes
    let cancelled = false
    async function scanAll() {
      for (const note of notes) {
        if (cancelled) break
        const s = await scanNote(note.path)
        setSignals(prev => new Map(prev).set(note.path, s))
      }
    }
    scanAll()
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    scanStarted.current = false
    setSignals(new Map())
  }, [workshop.path])

  if (!open) return null

  // ── Context menu ──────────────────────────────────────────────────────────

  const handleContextMenu = async (e: React.MouseEvent, note: NoteFile) => {
    e.preventDefault()
    e.stopPropagation()

    await showNoteContextMenu(note, workshop, {
      onDelete: async (n) => {
        try {
          await trashNote(n)
          onNoteDeleted(n)
        } catch (err) {
          console.error('[contextMenu] delete failed:', err)
        }
      },
      onMove: async (n, targetShelf) => {
        try {
          const moved = await moveNote(n, targetShelf, workshop.path)
          onNoteMoved(n, moved)
        } catch (err) {
          console.error('[contextMenu] move failed:', err)
        }
      },
      onReveal: async (n) => {
        try {
          await revealInFinder(n)
        } catch (err) {
          console.error('[contextMenu] reveal failed:', err)
        }
      },
      onRename: (n) => {
        renameCommittedRef.current = false
        setRenamingNote(n)
        setRenameValue(noteTitles.get(n.path) ?? formatNoteName(n.name))
      },
    })
  }

  // ── Inline rename ─────────────────────────────────────────────────────────

  const commitRename = async () => {
    console.log('commitRename fired, onRenamed is:', typeof onRenamed)
    if (renameCommittedRef.current || !renamingNote) return
    renameCommittedRef.current = true
    const note = renamingNote
    const newTitle = renameValue.trim()
    setRenamingNote(null)
    if (!newTitle || newTitle === formatNoteName(note.name)) return
    try {
      const renamed = await renameNoteOnDisk(note, newTitle, workshop.path)
      if (renamed) onRenamed(note, renamed, newTitle)  // ← pass newTitle
      console.log('commitRename calling onRenamed with newTitle:', newTitle)
    } catch (err) {
      console.error('Failed to rename:', err)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    if (e.key === 'Escape') { setRenamingNote(null) }
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  // Use module-level variable instead of dataTransfer to avoid Tauri webview
  // quirks where getData() returns empty string after async operations

  const handleDragStart = (e: React.DragEvent, note: NoteFile) => {
    draggedNotePath = note.path
    // Also set dataTransfer as fallback
    e.dataTransfer.setData('text/plain', note.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    draggedNotePath = null
    setDragOverShelf(null)
  }

  const handleShelfDragEnter = (e: React.DragEvent, shelfKey: string) => {
    e.preventDefault()
    setDragOverShelf(shelfKey)
  }

  const handleShelfDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleShelfDragLeave = (e: React.DragEvent, shelfKey: string) => {
    // Only clear if we're leaving to outside the shelf header
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as Node).contains(related)) return
    setDragOverShelf(prev => prev === shelfKey ? null : prev)
  }

  const handleShelfDrop = async (e: React.DragEvent, targetShelf: string[], _shelfKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverShelf(null)

    // Use module-level variable first, fall back to dataTransfer
    const notePath = draggedNotePath || e.dataTransfer.getData('text/plain')
    console.log('handleShelfDrop fired, notePath:', notePath, 'draggedNotePath was:', draggedNotePath)
    draggedNotePath = null

    if (!notePath) return

    const note = workshop.allNotes.find(n => n.path === notePath)
    if (!note) return

    // Don't move to same shelf
    if (note.shelf.join('/') === targetShelf.join('/')) return

    try {
      const moved = await moveNote(note, targetShelf, workshop.path)
      onNoteMoved(note, moved)
    } catch (err) {
      console.error('[drag] moveNote failed:', err)
    }
  }

  // Focus shelf rename input when it appears
  useEffect(() => {
    if (renamingShelf && renameShelfInputRef.current) {
      renameShelfInputRef.current.focus()
      renameShelfInputRef.current.select()
    }
  }, [renamingShelf])

  // ── Shelf collapse (collapsed by default — add to expanded set to open) ───

  const toggleShelf = (shelfPath: string) => {
    setExpandedShelves(prev => {
      const next = new Set(prev)
      if (next.has(shelfPath)) next.delete(shelfPath)
      else next.add(shelfPath)
      return next
    })
  }

  // ── Shelf context menu (Rename / Delete) ──────────────────────────────────

  const handleShelfContextMenu = async (e: React.MouseEvent, shelf: Shelf) => {
    e.preventDefault()
    e.stopPropagation()

    const items = await Promise.all([
      MenuItem.new({
        text: 'Rename',
        action: () => {
          renameShelfCommittedRef.current = false
          setRenamingShelf(shelf.path)
          setRenameShelfValue(shelf.name)
        },
      }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      MenuItem.new({
        text: 'Delete',
        action: async () => {
          try {
            await trashShelf(shelf.path)
            await onRefresh()
          } catch (err) {
            console.error('Failed to delete shelf:', err)
          }
        },
      }),
    ])

    const menu = await Menu.new({ items })
    await menu.popup()
  }

  // ── Shelf inline rename ───────────────────────────────────────────────────

  const commitRenameShelf = async () => {
    if (renameShelfCommittedRef.current || !renamingShelf) return
    renameShelfCommittedRef.current = true
    const shelfPath = renamingShelf
    const newName = renameShelfValue.trim()
    setRenamingShelf(null)
    if (!newName) return

    // Find the old shelf name from path
    const shelf = workshop.shelves.find(s => s.path === shelfPath)
    if (!shelf || newName === shelf.name) return

    try {
      await renameShelf(workshop.path, shelf.name, newName)
      // Keep the renamed shelf expanded if it was expanded before
      if (expandedShelves.has(shelfPath)) {
        const newPath = `${workshop.path}/${newName}`
        setExpandedShelves(prev => {
          const next = new Set(prev)
          next.delete(shelfPath)
          next.add(newPath)
          return next
        })
      }
      await onRefresh()
    } catch (err) {
      console.error('Failed to rename shelf:', err)
    }
  }

  const handleRenameShelfKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRenameShelf() }
    if (e.key === 'Escape') { setRenamingShelf(null) }
  }

  // ── New shelf ─────────────────────────────────────────────────────────────

  const commitNewShelf = async () => {
    const name = newShelfName.trim()
    setNewShelfMode(false)
    setNewShelfName('')
    if (!name) return
    try {
      await createShelf(workshop.path, name)
      await onRefresh()
    } catch (err) {
      console.error('Failed to create shelf:', err)
    }
  }

  const handleNewShelfKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitNewShelf() }
    if (e.key === 'Escape') { setNewShelfMode(false); setNewShelfName('') }
  }

  // ── Search filter ─────────────────────────────────────────────────────────

  const filtered = search.trim()
    ? workshop.allNotes.filter(n => {
        const term = search.toLowerCase()
        const humanName = n.shelf.includes('folio')
          ? formatFolioName(n.name).toLowerCase()
          : formatNoteName(n.name).toLowerCase()
        return n.name.toLowerCase().includes(term) || humanName.includes(term)
      })
    : null

  const handleSelect = (note: NoteFile) => {
    onNoteSelect(note)
    onClose()
  }

  const todayStr = localDateStr(new Date())

  // ── Note row renderer ─────────────────────────────────────────────────────

  const renderNoteRow = (
    note: NoteFile,
    dotClass: string = '',
    displayName: string,
    draggable: boolean = true,
  ) => {
    const isRenaming = renamingNote?.path === note.path
    const resolvedName = noteTitles.get(note.path) ?? displayName
    return (
      <div
        key={note.path}
        className="gv-nav-file"
        draggable={draggable}
        onDragStart={draggable ? (e) => handleDragStart(e, note) : undefined}
        onDragEnd={draggable ? handleDragEnd : undefined}
        onClick={() => { if (!isRenaming) handleSelect(note) }}
        onContextMenu={(e) => handleContextMenu(e, note)}
      >
        <span className={`gv-nav-dot ${dotClass}`} />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="gv-nav-rename-input"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="gv-nav-filename">{resolvedName}</span>
            <NoteSignalDots signals={signals.get(note.path) ?? null} />
          </>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="gv-nav-overlay" onClick={onClose}>
      <div className="gv-nav" onClick={e => e.stopPropagation()}>

        <div className="gv-nav-header">
          <span className="gv-nav-logo">{workshop.name}</span>
          <span className="gv-nav-close" onClick={onClose}>← back</span>
        </div>

        <div className="gv-nav-body">
          <input
            className="gv-nav-search"
            placeholder="Find a note…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />

          {/* ── Search results ── */}
          {filtered && (
            <div className="gv-nav-section">
              <div className="gv-nav-section-label">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </div>
              {filtered.length === 0 && (
                <div className="gv-nav-empty">Nothing found.</div>
              )}
              {filtered.map(note => renderNoteRow(
                note,
                note.shelf.includes('folio') ? 'folio' : note.shelf.includes('scratch') ? 'scratch' : '',
                note.shelf.includes('folio') ? formatFolioName(note.name) : formatNoteName(note.name),
              ))}
            </div>
          )}

          {/* ── Single-column layout ── */}
          {!filtered && (
            <div className="gv-nav-single">

              {/* Scratch — always shown */}
              <div className="gv-nav-section">
                <div className="gv-nav-section-label">Scratch</div>
                {(() => {
                  const scratchNote = workshop.scratch.length > 0
                    ? workshop.scratch[0]
                    : workshop.allNotes.find(n => n.name === 'scratch' && n.shelf.length === 0)
                  return scratchNote
                    ? renderNoteRow(scratchNote, 'scratch', 'scratch', false)
                    : (
                      <div className="gv-nav-file gv-nav-empty-action"
                        onClick={() => { onTodayFolio(); onClose() }}>
                        <span className="gv-nav-dot scratch" />
                        <span className="gv-nav-filename">scratch</span>
                        <span className="gv-nav-date">⌘S</span>
                      </div>
                    )
                })()}
              </div>

              {/* Folio */}
              <div className="gv-nav-section">
                <div
                  className="gv-nav-section-label gv-nav-shelf-header"
                  onClick={() => setFolioExpanded(prev => !prev)}
                >
                  <span className="gv-nav-shelf-name">
                    <span className="gv-nav-chevron">{folioExpanded ? '▾' : '▸'}</span>
                    Folio
                  </span>
                </div>
                {folioExpanded && (
                  <>
                    <div
                      className="gv-nav-file"
                      onClick={() => { onTodayFolio(); onClose() }}
                    >
                      <span className="gv-nav-dot folio" />
                      <span className="gv-nav-filename">Today</span>
                      <span className="gv-nav-date">
                        {new Date().toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {workshop.folio
                      .filter(n => n.name !== todayStr)
                      .slice(0, 5)
                      .map(note =>
                        renderNoteRow(note, 'folio', formatFolioName(note.name))
                      )}
                  </>
                )}
              </div>

              {/* Workshop floor notes */}
              {(() => {
                const floorNotes = workshop.allNotes.filter(n =>
                  n.shelf.length === 0 && n.name !== 'scratch'
                )
                return floorNotes.length > 0 ? (
                  <div className="gv-nav-section">
                    <div className="gv-nav-section-label">Notes</div>
                    {floorNotes.map(note =>
                      renderNoteRow(note, '', formatNoteName(note.name))
                    )}
                  </div>
                ) : null
              })()}

              {/* Shelves */}
              {workshop.shelves.length > 0 && (
                <div className="gv-nav-section">
                  <div className="gv-nav-section-label">Shelves</div>
                </div>
              )}

              {workshop.shelves.map(shelf => {
                const isCollapsed = !expandedShelves.has(shelf.path)
                const shelfKey = shelf.path
                const isDragOver = dragOverShelf === shelfKey
                const isRenamingThisShelf = renamingShelf === shelf.path
                return (
                  <div key={shelf.path} className="gv-nav-section">
                    <div
                      className={`gv-nav-section-label gv-nav-shelf-header ${isDragOver ? 'gv-drag-over' : ''}`}
                      onClick={() => { if (!isRenamingThisShelf) toggleShelf(shelf.path) }}
                      onContextMenu={(e) => handleShelfContextMenu(e, shelf)}
                      onDragEnter={(e) => handleShelfDragEnter(e, shelfKey)}
                      onDragOver={handleShelfDragOver}
                      onDragLeave={(e) => handleShelfDragLeave(e, shelfKey)}
                      onDrop={(e) => handleShelfDrop(e, [shelf.name], shelfKey)}
                    >
                      {isRenamingThisShelf ? (
                        <input
                          ref={renameShelfInputRef}
                          className="gv-nav-rename-input"
                          value={renameShelfValue}
                          onChange={e => setRenameShelfValue(e.target.value)}
                          onKeyDown={handleRenameShelfKeyDown}
                          onBlur={commitRenameShelf}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="gv-nav-shelf-name">
                          <span className="gv-nav-chevron">{isCollapsed ? '▸' : '▾'}</span>
                          {formatNoteName(shelf.name)}
                        </span>
                      )}
                    </div>
                    {!isCollapsed && !isRenamingThisShelf && (
                      <>
                        {shelf.notes.slice(0, 6).map(note =>
                          renderNoteRow(note, '', formatNoteName(note.name))
                        )}
                        {shelf.notes.length === 0 && (
                          <div className="gv-nav-empty">Empty shelf.</div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}

              {/* New shelf */}
              <div className="gv-nav-add-shelf-row">
                {newShelfMode ? (
                  <input
                    ref={newShelfInputRef}
                    className="gv-nav-new-shelf-input"
                    placeholder="Shelf name…"
                    value={newShelfName}
                    onChange={e => setNewShelfName(e.target.value)}
                    onKeyDown={handleNewShelfKeyDown}
                    onBlur={commitNewShelf}
                  />
                ) : (
                  <button
                    className="gv-nav-add-shelf-btn"
                    onClick={() => setNewShelfMode(true)}
                    title="New shelf"
                  >+</button>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
