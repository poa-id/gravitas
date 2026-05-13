import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const gravatisTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--text)',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    fontFamily: 'var(--font-prose)',
    fontSize: 'var(--font-size)',
    lineHeight: 'var(--line-height)',
    padding: '0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    background: 'rgba(122, 106, 74, 0.15)',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-line': {
    padding: '0',
  },
})

const gravatisHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '500', fontSize: '1.35em' },
  { tag: t.heading2, fontWeight: '500', fontSize: '1.18em' },
  { tag: t.heading3, fontWeight: '500', fontSize: '1.05em' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '500' },
  { tag: t.url, color: 'var(--link)' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.9em', color: 'var(--text-dim)' },
  { tag: t.punctuation, color: 'var(--text-dimmer)' },
  { tag: t.meta, color: 'var(--text-dimmer)' },
  { tag: t.comment, color: 'var(--text-dimmer)', fontStyle: 'italic' },
  { tag: t.quote, color: 'var(--text-dim)', fontStyle: 'italic' },
])

export const gravitas = [gravatisTheme, syntaxHighlighting(gravatisHighlight)]