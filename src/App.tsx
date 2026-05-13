import './styles.css'
import { useState } from 'react'
import Editor from './editor/Editor'
import Nav from './ui/Nav'
import EmptyState from './ui/EmptyState'

const DEMO_NOTE = {
  title: 'Welcome to Gravitas',
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

export default function App() {
  const [workshopOpen, setWorkshopOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const handleOpen = () => {
    // For now, go straight to editor
    // Phase 2: open folder dialog here
    setWorkshopOpen(true)
  }

  if (!workshopOpen) {
    return <EmptyState onOpen={handleOpen} />
  }

  return (
    <div className="app">
      <Nav open={navOpen} onClose={() => setNavOpen(false)} />
      <Editor
        note={DEMO_NOTE}
        onNavOpen={() => setNavOpen(true)}
      />
    </div>
  )
}