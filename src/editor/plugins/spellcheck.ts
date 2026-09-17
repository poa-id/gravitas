import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder, StateEffect } from '@codemirror/state'
import nspell, { type NSpell } from 'nspell'
import { getPreferences, type SpellcheckLanguage } from '../../workshop/preferences'

export const SPELLCHECK_LANGUAGE_EVENT = 'gravitas:spellcheck-language'
export const SPELLCHECK_SUGGESTIONS_EVENT = 'gravitas:spellcheck-suggestions'
export const SPELLCHECK_DISMISS_EVENT = 'gravitas:spellcheck-dismiss'
export const SPELLCHECK_APPLY_EVENT = 'gravitas:spellcheck-apply'

export interface SpellcheckSuggestionDetail {
  word: string
  from: number
  to: number
  suggestions: string[]
  x: number
  y: number
}

export interface SpellcheckApplyDetail {
  from: number
  to: number
  replacement: string
}

const refreshSpellcheck = StateEffect.define<null>()
const dictionaryCache = new Map<Exclude<SpellcheckLanguage, 'off'>, Promise<NSpell>>()
const misspelling = Decoration.mark({ class: 'gv-spelling-error' })
const wordPattern = /[\p{L}][\p{L}\p{M}'’\-]*/gu

function isAudit(view: EditorView) {
  return view.dom.closest('.gv-editor')?.classList.contains('gv-mode-audit') ?? false
}

function dictionaryUrl(language: Exclude<SpellcheckLanguage, 'off'>, extension: 'aff' | 'dic') {
  return `/spell/${language}.${extension}`
}

async function loadDictionary(language: Exclude<SpellcheckLanguage, 'off'>): Promise<NSpell> {
  const cached = dictionaryCache.get(language)
  if (cached) return cached

  const pending = Promise.all([
    fetch(dictionaryUrl(language, 'aff')).then(response => {
      if (!response.ok) throw new Error(`Spellcheck affix dictionary unavailable: ${response.status}`)
      return response.text()
    }),
    fetch(dictionaryUrl(language, 'dic')).then(response => {
      if (!response.ok) throw new Error(`Spellcheck word dictionary unavailable: ${response.status}`)
      return response.text()
    }),
  ]).then(([aff, dic]) => nspell({ aff, dic }))

  dictionaryCache.set(language, pending)
  return pending
}

function buildDecorations(view: EditorView, spell: NSpell | null, language: SpellcheckLanguage): DecorationSet {
  if (!spell || language === 'off' || !isAudit(view)) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  for (const range of view.visibleRanges) {
    const text = view.state.sliceDoc(range.from, range.to)
    wordPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = wordPattern.exec(text))) {
      const word = match[0]
      if (word.length < 2 || /^\p{Lu}$/u.test(word) || /\d/.test(word)) continue
      const before = text.slice(Math.max(0, match.index - 2), match.index)
      const after = text.slice(match.index + word.length, match.index + word.length + 2)
      if (before === '[[' || after === ']]') continue
      if (!spell.correct(word)) {
        const from = range.from + match.index
        builder.add(from, from + word.length, misspelling)
      }
    }
  }
  return builder.finish()
}

function wordAt(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos)
  wordPattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = wordPattern.exec(line.text))) {
    const from = line.from + match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) return { word: match[0], from, to }
  }
  return null
}

export const spellcheckPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet = Decoration.none
  private language: SpellcheckLanguage = 'off'
  private spell: NSpell | null = null
  private disposed = false
  private modeObserver: MutationObserver
  private languageHandler: (event: Event) => void
  private applyHandler: (event: Event) => void
  private pointerHandler: (event: PointerEvent) => void

  constructor(private view: EditorView) {
    view.contentDOM.spellcheck = false
    const editor = view.dom.closest('.gv-editor')
    this.modeObserver = new MutationObserver(() => {
      view.contentDOM.spellcheck = false
      this.view.dispatch({ effects: refreshSpellcheck.of(null) })
    })
    if (editor) this.modeObserver.observe(editor, { attributes: true, attributeFilter: ['class'] })

    this.languageHandler = (event: Event) => {
      const language = (event as CustomEvent<SpellcheckLanguage>).detail
      void this.setLanguage(language)
    }
    window.addEventListener(SPELLCHECK_LANGUAGE_EVENT, this.languageHandler)

    this.applyHandler = (event: Event) => {
      const { from, to, replacement } = (event as CustomEvent<SpellcheckApplyDetail>).detail
      if (from < 0 || to > this.view.state.doc.length || from >= to) return
      this.view.dispatch({ changes: { from, to, insert: replacement }, selection: { anchor: from + replacement.length } })
      this.view.focus()
    }
    window.addEventListener(SPELLCHECK_APPLY_EVENT, this.applyHandler)

    this.pointerHandler = (event: PointerEvent) => {
      if (!this.spell || this.language === 'off' || !isAudit(this.view)) return
      const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return
      const found = wordAt(this.view, pos)
      if (!found || this.spell.correct(found.word)) {
        window.dispatchEvent(new CustomEvent(SPELLCHECK_DISMISS_EVENT))
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const coords = this.view.coordsAtPos(found.from)
      const endCoords = this.view.coordsAtPos(found.to)
      const suggestions = this.spell.suggest(found.word).slice(0, 5)
      window.dispatchEvent(new CustomEvent<SpellcheckSuggestionDetail>(SPELLCHECK_SUGGESTIONS_EVENT, { detail: {
        ...found,
        suggestions,
        x: coords ? Math.min(window.innerWidth - 160, coords.left) : event.clientX,
        y: endCoords ? endCoords.bottom + 7 : event.clientY + 7,
      } }))
    }
    view.contentDOM.addEventListener('pointerdown', this.pointerHandler)

    void getPreferences().then(prefs => this.setLanguage(prefs.spellcheckLanguage))
  }

  private async setLanguage(language: SpellcheckLanguage) {
    this.language = language
    this.spell = null
    this.decorations = Decoration.none
    window.dispatchEvent(new CustomEvent(SPELLCHECK_DISMISS_EVENT))
    this.view.dispatch({ effects: refreshSpellcheck.of(null) })
    if (language === 'off') return

    try {
      const spell = await loadDictionary(language)
      if (this.disposed || this.language !== language) return
      this.spell = spell
      this.view.dispatch({ effects: refreshSpellcheck.of(null) })
    } catch (error) {
      console.error('Failed to load spellcheck dictionary:', error)
    }
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshSpellcheck)))) {
      this.decorations = buildDecorations(update.view, this.spell, this.language)
      if (update.docChanged) window.dispatchEvent(new CustomEvent(SPELLCHECK_DISMISS_EVENT))
    }
  }

  destroy() {
    this.disposed = true
    this.modeObserver.disconnect()
    this.view.contentDOM.removeEventListener('pointerdown', this.pointerHandler)
    window.removeEventListener(SPELLCHECK_LANGUAGE_EVENT, this.languageHandler)
    window.removeEventListener(SPELLCHECK_APPLY_EVENT, this.applyHandler)
  }
}, {
  decorations: value => value.decorations,
})
