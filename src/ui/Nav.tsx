import { useState } from 'react'
import type { Workshop, NoteFile } from '../workshop/workshopAdapter'
import './Nav.css'

interface NavProps {
  open: boolean
  onClose: () => void
  onNoteSelect: (note: NoteFile) => void
  workshop: Workshop
}

export default function Nav({ open, onClose, onNoteSelect, workshop }: NavProps) {
  const [search, setSearch] = useState('')

  if (!open) return null

  // Filter all notes by search query
  const filtered = search.trim()
    ? workshop.allNotes.filter(n =>
        n.name.toLowerCase().includes(search.toLowerCase())
      )
    : null

  const handleSelect = (note: NoteFile) => {
    onNoteSelect(note)
    onClose()
  }

  // Format a date string like "2026-05-11" into "today", "yesterday", or "May 11"
  const formatDate = (name: string): string => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    if (name === today) return 'today'
    if (name === yesterday) return 'yesterday'
    // Try to parse as date
    const d = new Date(name)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
    }
    return ''
  }

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

          {/* Search results */}
          {filtered && (
            <div className="gv-nav-section">
              <div className="gv-nav-section-label">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </div>
              {filtered.length === 0 && (
                <div className="gv-nav-empty">Nothing found.</div>
              )}
              {filtered.map(note => (
                <div
                  key={note.path}
                  className="gv-nav-file"
                  onClick={() => handleSelect(note)}
                >
                  <span className="gv-nav-dot" />
                  <span className="gv-nav-filename">{note.name}</span>
                  <span className="gv-nav-date">
                    {note.shelf.join(' / ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Normal view — only when not searching */}
          {!filtered && (
            <div className="gv-nav-cols">
              <div className="gv-nav-col">

                {/* Scratch */}
                {workshop.scratch.length > 0 && (
  <div className="gv-nav-section">
    <div className="gv-nav-section-label">
      Scratch
      <span className="gv-nav-inbox-count">{workshop.scratch.length}</span>
    </div>
    {workshop.scratch.map(note => (
      <div
        key={note.path}
        className="gv-nav-file"
        onClick={() => handleSelect(note)}
      >
        <span className="gv-nav-dot scratch" />
        <span className="gv-nav-filename">{note.name}</span>
      </div>
    ))}
  </div>
)}

                {/* Folio — daily notes */}
                <div className="gv-nav-section">
                  <div className="gv-nav-section-label">Folio</div>
                  {workshop.folio.slice(0, 5).map(note => (
                    <div
                      key={note.path}
                      className="gv-nav-file"
                      onClick={() => handleSelect(note)}
                    >
                      <span className="gv-nav-dot" />
                      <span className="gv-nav-filename">{note.name}</span>
                      <span className="gv-nav-date">{formatDate(note.name)}</span>
                    </div>
                  ))}
                  {workshop.folio.length === 0 && (
                    <div className="gv-nav-empty">No folios yet.</div>
                  )}
                </div>

              </div>

              <div className="gv-nav-col">

                {/* Shelves */}
                {workshop.shelves.map(shelf => (
                  <div key={shelf.path} className="gv-nav-section">
                    <div className="gv-nav-section-label">{shelf.name}</div>
                    {shelf.notes.slice(0, 6).map(note => (
                      <div
                        key={note.path}
                        className="gv-nav-file"
                        onClick={() => handleSelect(note)}
                      >
                        <span className={`gv-nav-dot`} />
                        <span className="gv-nav-filename">{note.name}</span>
                      </div>
                    ))}
                    {shelf.notes.length === 0 && (
                      <div className="gv-nav-empty">Empty shelf.</div>
                    )}
                  </div>
                ))}

                {/* Root notes — not in any shelf */}
                {workshop.allNotes.filter(n => n.shelf.length === 0).length > 0 && (
                  <div className="gv-nav-section">
                    <div className="gv-nav-section-label">Loose</div>
                    {workshop.allNotes
                      .filter(n => n.shelf.length === 0)
                      .map(note => (
                        <div
                          key={note.path}
                          className="gv-nav-file"
                          onClick={() => handleSelect(note)}
                        >
                          <span className="gv-nav-dot" />
                          <span className="gv-nav-filename">{note.name}</span>
                        </div>
                      ))}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}