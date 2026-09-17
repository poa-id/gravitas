import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder, StateEffect } from '@codemirror/state'
import nspell, { type NSpell } from 'nspell'
import { getPreferences, type SpellcheckLanguage } from '../../workshop/preferences'

export const SPELLCHECK_LANGUAGE_EVENT = 'gravitas:spellcheck-language'

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

export const spellcheckPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet = Decoration.none
  private language: SpellcheckLanguage = 'off'
  private spell: NSpell | null = null
  private disposed = false
  private modeObserver: MutationObserver
  private languageHandler: (event: Event) => void

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

    void getPreferences().then(prefs => this.setLanguage(prefs.spellcheckLanguage))
  }

  private async setLanguage(language: SpellcheckLanguage) {
    this.language = language
    this.spell = null
    this.decorations = Decoration.none
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
    }
  }

  destroy() {
    this.disposed = true
    this.modeObserver.disconnect()
    window.removeEventListener(SPELLCHECK_LANGUAGE_EVENT, this.languageHandler)
  }
}, {
  decorations: value => value.decorations,
})
