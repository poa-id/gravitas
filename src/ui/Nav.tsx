import './Nav.css'

interface NavProps {
  open: boolean
  onClose: () => void
}

const DEMO_FILES = {
  scratch: 3,
  folio: [
    { name: '2026-05-11', label: 'today' },
    { name: '2026-05-10', label: 'yesterday' },
    { name: '2026-05-09', label: '3d ago' },
  ],
  workshop: [
    { name: 'On craft and tools', type: 'piece', label: 'now' },
    { name: 'Writing process', type: 'piece', label: '3d ago' },
    { name: 'Song — La espera', type: 'scratch', label: '1w ago' },
    { name: 'Sourdough recipe', type: 'note', label: '2w ago' },
  ],
  reference: [
    { name: 'Reading list', type: 'note', label: '1mo ago' },
    { name: 'Gravitas — PRD', type: 'piece', label: 'today' },
  ],
}

export default function Nav({ open, onClose }: NavProps) {
  if (!open) return null

  return (
    <div className="gv-nav-overlay" onClick={onClose}>
      <div className="gv-nav" onClick={e => e.stopPropagation()}>
        <div className="gv-nav-header">
          <span className="gv-nav-logo">Gravitas</span>
          <span className="gv-nav-close" onClick={onClose}>← back</span>
        </div>

        <div className="gv-nav-body">
          <input
            className="gv-nav-search"
            placeholder="Find a note…"
            autoFocus
          />

          <div className="gv-nav-scratch" onClick={onClose}>
            <span className="gv-nav-scratch-label">Scratch</span>
            <span className="gv-nav-scratch-count">{DEMO_FILES.scratch}</span>
          </div>

          <div className="gv-nav-cols">
            <div className="gv-nav-col">
              <div className="gv-nav-section">
                <div className="gv-nav-section-label">Folio</div>
                {DEMO_FILES.folio.map(f => (
                  <div key={f.name} className="gv-nav-file" onClick={onClose}>
                    <span className="gv-nav-dot" />
                    <span className="gv-nav-filename">{f.name}</span>
                    <span className="gv-nav-date">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="gv-nav-col">
              <div className="gv-nav-section">
                <div className="gv-nav-section-label">Workshop</div>
                {DEMO_FILES.workshop.map(f => (
                  <div key={f.name} className={`gv-nav-file ${f.name === 'On craft and tools' ? 'active' : ''}`} onClick={onClose}>
                    <span className={`gv-nav-dot ${f.type}`} />
                    <span className="gv-nav-filename">{f.name}</span>
                    <span className="gv-nav-date">{f.label}</span>
                  </div>
                ))}
              </div>

              <div className="gv-nav-section">
                <div className="gv-nav-section-label">Reference</div>
                {DEMO_FILES.reference.map(f => (
                  <div key={f.name} className="gv-nav-file" onClick={onClose}>
                    <span className={`gv-nav-dot ${f.type}`} />
                    <span className="gv-nav-filename">{f.name}</span>
                    <span className="gv-nav-date">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
