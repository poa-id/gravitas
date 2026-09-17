import './EmptyState.css'

interface EmptyStateProps {
  onOpen: () => void
}

export default function EmptyState({ onOpen }: EmptyStateProps) {
  return (
    <div className="gv-empty">
      <main className="gv-empty-center">
        <div className="gv-empty-wordmark">Gravitas</div>

        <section className="gv-empty-intro">
          <h1>A writing workshop.</h1>
          <p className="gv-empty-premise">
            Write without interruption. Read what you wrote. Finish deliberately.
          </p>
          <p className="gv-empty-explain">
            Writing and judging your writing are different kinds of work. Gravitas gives each its own space.
          </p>
        </section>

        <section className="gv-empty-loop" aria-label="The Gravitas writing loop">
          <div className="gv-empty-step">
            <span>Write</span>
            <p>Get the words down without review tools competing for your attention.</p>
          </div>
          <div className="gv-empty-rule" />
          <div className="gv-empty-step">
            <span>Read</span>
            <p>Step away from the editor. Read your work as a reader would.</p>
          </div>
          <div className="gv-empty-rule" />
          <div className="gv-empty-step">
            <span>Audit</span>
            <p>Return to your marks, revise deliberately, and finish.</p>
          </div>
        </section>

        <section className="gv-empty-workshop">
          <h2>Your workshop is just a folder.</h2>
          <p>
            Gravitas works directly with ordinary Markdown files on your computer. Choose a folder and it becomes your workshop.
          </p>
          <button className="gv-empty-btn" onClick={onOpen}>
            Open a workshop
          </button>
          <p className="gv-empty-hint">Your writing stays yours.</p>
        </section>
      </main>
    </div>
  )
}
