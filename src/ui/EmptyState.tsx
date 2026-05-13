import './EmptyState.css'

interface EmptyStateProps {
  onOpen: () => void
}

export default function EmptyState({ onOpen }: EmptyStateProps) {
  return (
    <div className="gv-empty">
      <div className="gv-empty-center">
        <div className="gv-empty-wordmark">Gravitas</div>
        <div className="gv-empty-line" />
        <p className="gv-empty-sub">
          A place for thought. No more, no less.
        </p>
        <button className="gv-empty-btn" onClick={onOpen}>
          Open a workshop
        </button>
        <p className="gv-empty-hint">
          Choose a folder. Your files stay yours.
        </p>
      </div>
    </div>
  )
}