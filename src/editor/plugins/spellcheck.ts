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
  private ignored = new Set<string>()
  private menu: HTMLDivElement | null = null
  private modeObserver: MutationObserver
  private languageHandler: (event: Event) => void
  private pointerHandler: (event: PointerEvent) => void
  private outsideHandler: (event: PointerEvent) => void
  private keyHandler: (event: KeyboardEvent) => void

  constructor(private view: EditorView) {
    view.contentDOM.spellcheck = false
    const editor = view.dom.closest('.gv-editor')
    this.modeObserver = new MutationObserver(() => {
      view.contentDOM.spellcheck = false
      if (!isAudit(this.view)) this.closeMenu()
      this.view.dispatch({ effects: refreshSpellcheck.of(null) })
    })
    if (editor) this.modeObserver.observe(editor, { attributes: true, attributeFilter: ['class'] })

    this.languageHandler = (event: Event) => {
      const language = (event as CustomEvent<SpellcheckLanguage>).detail
      void this.setLanguage(language)
    }
    window.addEventListener(SPELLCHECK_LANGUAGE_EVENT, this.languageHandler)

    this.pointerHandler = (event: PointerEvent) => {
      if (!this.spell || this.language === 'off' || !isAudit(this.view)) return
      const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return
      const found = wordAt(this.view, pos)
      if (!found || this.spell.correct(found.word) || this.ignored.has(found.word.toLocaleLowerCase())) {
        this.closeMenu()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      this.openMenu(found.word, found.from, found.to)
    }
    view.contentDOM.addEventListener('pointerdown', this.pointerHandler)

    this.outsideHandler = (event: PointerEvent) => {
      if (this.menu && !this.menu.contains(event.target as Node) && !this.view.contentDOM.contains(event.target as Node)) this.closeMenu()
    }
    window.addEventListener('pointerdown', this.outsideHandler)

    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.menu) return
      const buttons = Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button'))
      if (event.key === 'Escape') {
        event.preventDefault()
        this.closeMenu()
        this.view.focus()
        return
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && buttons.length) {
        event.preventDefault()
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const delta = event.key === 'ArrowDown' ? 1 : -1
        buttons[(current + delta + buttons.length) % buttons.length].focus()
      }
    }
    window.addEventListener('keydown', this.keyHandler)

    void getPreferences().then(prefs => this.setLanguage(prefs.spellcheckLanguage))
  }

  private closeMenu() {
    this.menu?.remove()
    this.menu = null
  }

  private replace(from: number, to: number, replacement: string) {
    this.view.dispatch({ changes: { from, to, insert: replacement }, selection: { anchor: from + replacement.length } })
    this.closeMenu()
    this.view.focus()
  }

  private openMenu(word: string, from: number, to: number) {
    if (!this.spell) return
    this.closeMenu()
    const menu = document.createElement('div')
    menu.className = 'gv-spell-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', `Spelling suggestions for ${word}`)

    const suggestions = this.spell.suggest(word).slice(0, 5)
    if (suggestions.length) {
      suggestions.forEach((suggestion, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'gv-spell-suggestion'
        button.setAttribute('role', 'menuitem')
        button.textContent = suggestion
        button.addEventListener('pointerdown', event => event.stopPropagation())
        button.addEventListener('click', () => this.replace(from, to, suggestion))
        menu.appendChild(button)
        if (index === 0) requestAnimationFrame(() => button.focus())
      })
    } else {
      const empty = document.createElement('span')
      empty.className = 'gv-spell-empty'
      empty.textContent = 'No suggestions'
      menu.appendChild(empty)
    }

    const divider = document.createElement('i')
    divider.className = 'gv-spell-divider'
    menu.appendChild(divider)

    const ignore = document.createElement('button')
    ignore.type = 'button'
    ignore.className = 'gv-spell-ignore'
    ignore.setAttribute('role', 'menuitem')
    ignore.textContent = 'Ignore for now'
    ignore.addEventListener('pointerdown', event => event.stopPropagation())
    ignore.addEventListener('click', () => {
      this.ignored.add(word.toLocaleLowerCase())
      this.closeMenu()
      this.view.dispatch({ effects: refreshSpellcheck.of(null) })
      this.view.focus()
    })
    menu.appendChild(ignore)

    document.body.appendChild(menu)
    this.menu = menu
    const start = this.view.coordsAtPos(from)
    const end = this.view.coordsAtPos(to)
    const rect = menu.getBoundingClientRect()
    const left = Math.max(10, Math.min(window.innerWidth - rect.width - 10, start?.left ?? 10))
    const below = (end?.bottom ?? 0) + 7
    const top = below + rect.height < window.innerHeight - 10 ? below : Math.max(10, (start?.top ?? 10) - rect.height - 7)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }

  private async setLanguage(language: SpellcheckLanguage) {
    this.language = language
    this.spell = null
    this.ignored.clear()
    this.closeMenu()
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
      if (!this.spell || this.language === 'off' || !isAudit(update.view)) {
        this.decorations = Decoration.none
      } else {
        const all = buildDecorations(update.view, this.spell, this.language)
        if (!this.ignored.size) this.decorations = all
        else {
          const builder = new RangeSetBuilder<Decoration>()
          for (const range of update.view.visibleRanges) {
            const text = update.view.state.sliceDoc(range.from, range.to)
            wordPattern.lastIndex = 0
            let match: RegExpExecArray | null
            while ((match = wordPattern.exec(text))) {
              const word = match[0]
              if (word.length < 2 || this.ignored.has(word.toLocaleLowerCase()) || this.spell.correct(word)) continue
              const before = text.slice(Math.max(0, match.index - 2), match.index)
              const after = text.slice(match.index + word.length, match.index + word.length + 2)
              if (before === '[[' || after === ']]') continue
              const from = range.from + match.index
              builder.add(from, from + word.length, misspelling)
            }
          }
          this.decorations = builder.finish()
        }
      }
      if (update.docChanged || update.viewportChanged) this.closeMenu()
    }
  }

  destroy() {
    this.disposed = true
    this.closeMenu()
    this.modeObserver.disconnect()
    this.view.contentDOM.removeEventListener('pointerdown', this.pointerHandler)
    window.removeEventListener(SPELLCHECK_LANGUAGE_EVENT, this.languageHandler)
    window.removeEventListener('pointerdown', this.outsideHandler)
    window.removeEventListener('keydown', this.keyHandler)
  }
}, {
  decorations: value => value.decorations,
})
