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
        <p className="gv-empty-explain">
          Choose a folder to use as your workshop. Gravitas writes ordinary Markdown files there — no account, no cloud, no lock-in.
        </p>
        <button className="gv-empty-btn" onClick={onOpen}>
          Open a workshop
        </button>
        <p className="gv-empty-hint">
          Your files stay yours.
        </p>
      </div>
    </div>
  )
}
