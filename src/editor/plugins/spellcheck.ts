import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder, StateEffect } from '@codemirror/state'
import nspell, { type NSpell } from 'nspell'
import { getPreferences, type SpellcheckLanguage } from '../../workshop/preferences'
import { addWordToWorkshopDictionary, loadWorkshopDictionary } from '../../workshop/workshopAdapter'

export const SPELLCHECK_LANGUAGE_EVENT = 'gravitas:spellcheck-language'

interface GrammarIssue {
  from: number
  to: number
  message: string
  suggestions: string[]
  ignoreKey: string
}

const refreshSpellcheck = StateEffect.define<null>()
const dictionaryCache = new Map<Exclude<SpellcheckLanguage, 'off'>, Promise<NSpell>>()
const misspelling = Decoration.mark({ class: 'gv-spelling-error' })
const grammarMark = Decoration.mark({ class: 'gv-grammar-error' })
const wordPattern = /[\p{L}][\p{L}\p{M}'’\-]*/gu
const wordKey = (word: string) => word.toLocaleLowerCase()

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

function spellingRanges(view: EditorView, spell: NSpell, ignored: Set<string>, workshopWords: Set<string>) {
  const ranges: { from: number; to: number; decoration: Decoration }[] = []
  for (const range of view.visibleRanges) {
    const text = view.state.sliceDoc(range.from, range.to)
    wordPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = wordPattern.exec(text))) {
      const word = match[0]
      const key = wordKey(word)
      if (word.length < 2 || /^\p{Lu}$/u.test(word) || /\d/.test(word) || ignored.has(key) || workshopWords.has(key) || spell.correct(word)) continue
      const before = text.slice(Math.max(0, match.index - 2), match.index)
      const after = text.slice(match.index + word.length, match.index + word.length + 2)
      if (before === '[[' || after === ']]') continue
      const from = range.from + match.index
      ranges.push({ from, to: from + word.length, decoration: misspelling })
    }
  }
  return ranges
}

function buildDecorations(view: EditorView, spell: NSpell | null, language: SpellcheckLanguage, ignored: Set<string>, workshopWords: Set<string>, grammarIssues: GrammarIssue[]): DecorationSet {
  if (language === 'off' || !isAudit(view)) return Decoration.none
  const ranges = spell ? spellingRanges(view, spell, ignored, workshopWords) : []
  if (language === 'en') {
    for (const issue of grammarIssues) {
      if (issue.to <= issue.from) continue
      ranges.push({ from: issue.from, to: issue.to, decoration: grammarMark })
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const range of ranges) builder.add(range.from, range.to, range.decoration)
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
  private workshopWords = new Set<string>()
  private workshopPath: string | null = null
  private ignoredGrammar = new Set<string>()
  private grammarIssues: GrammarIssue[] = []
  private grammarLinter: any = null
  private grammarTimer: ReturnType<typeof setTimeout> | null = null
  private grammarRun = 0
  private refreshQueued = false
  private menu: HTMLDivElement | null = null
  private modeObserver: MutationObserver
  private languageHandler: (event: Event) => void
  private pointerHandler: (event: PointerEvent) => void
  private grammarUnavailable = false
  private outsideHandler: (event: PointerEvent) => void
  private keyHandler: (event: KeyboardEvent) => void
  private focusHandler: () => void

  constructor(private view: EditorView) {
    view.contentDOM.spellcheck = false
    const editor = view.dom.closest('.gv-editor')
    this.modeObserver = new MutationObserver(() => {
      view.contentDOM.spellcheck = false
      if (!isAudit(this.view)) this.closeMenu()
      this.scheduleGrammar()
      this.refresh()
    })
    if (editor) this.modeObserver.observe(editor, { attributes: true, attributeFilter: ['class'] })

    this.languageHandler = (event: Event) => {
      const language = (event as CustomEvent<SpellcheckLanguage>).detail
      void this.setLanguage(language)
    }
    window.addEventListener(SPELLCHECK_LANGUAGE_EVENT, this.languageHandler)

    this.pointerHandler = (event: PointerEvent) => {
      if (this.language === 'off' || !isAudit(this.view)) return
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const spelling = target.closest('.gv-spelling-error')
      const grammar = target.closest('.gv-grammar-error')
      if (!spelling && !grammar) { this.closeMenu(); return }
      // CodeMirror mark decorations may share a DOM text node with surrounding
      // prose, so deriving document offsets from DOM text length is not reliable.
      // The clicked decoration itself does tell us the exact visible word. Match
      // that word against the current document and choose the occurrence nearest
      // the editor selection; the menu remains anchored to the clicked DOM mark.
      if (grammar && this.language === 'en') {
        const visible = grammar.textContent?.trim() ?? ''
        const candidates = this.grammarIssues.filter(item => this.view.state.sliceDoc(item.from, item.to).trim() === visible)
        const head = this.view.state.selection.main.head
        const issue = candidates.sort((a, b) => Math.abs(a.from - head) - Math.abs(b.from - head))[0]
        if (issue) { event.preventDefault(); event.stopPropagation(); this.openGrammarMenu(issue, grammar as HTMLElement); return }
      }
      if (!spelling || !this.spell) return
      const word = spelling.textContent?.trim() ?? ''
      if (!word || this.spell.correct(word) || this.ignored.has(wordKey(word)) || this.workshopWords.has(wordKey(word))) return
      const source = this.view.state.doc.toString()
      const matches: Array<{ from: number; to: number }> = []
      wordPattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = wordPattern.exec(source))) if (match[0] === word) matches.push({ from: match.index, to: match.index + word.length })
      if (!matches.length) return
      const head = this.view.state.selection.main.head
      const found = matches.sort((a, b) => Math.abs(a.from - head) - Math.abs(b.from - head))[0]
      event.preventDefault(); event.stopPropagation(); this.openSpellingMenu(word, found.from, found.to, spelling as HTMLElement)
    }
    view.contentDOM.addEventListener('pointerdown', this.pointerHandler)

    this.outsideHandler = (event: PointerEvent) => {
      if (this.menu && !this.menu.contains(event.target as Node) && !this.view.contentDOM.contains(event.target as Node)) this.closeMenu()
    }
    window.addEventListener('pointerdown', this.outsideHandler)

    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.menu) return
      const buttons = Array.from(this.menu.querySelectorAll<HTMLButtonElement>('button'))
      if (event.key === 'Escape') { event.preventDefault(); this.closeMenu(); this.view.focus(); return }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && buttons.length) {
        event.preventDefault()
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const delta = event.key === 'ArrowDown' ? 1 : -1
        buttons[(current + delta + buttons.length) % buttons.length].focus()
      }
    }
    window.addEventListener('keydown', this.keyHandler)

    this.focusHandler = () => { void this.loadWorkshopWords() }
    view.contentDOM.addEventListener('focusin', this.focusHandler)

    void getPreferences().then(async prefs => {
      await this.loadWorkshopWords(prefs.lastWorkshopPath)
      await this.setLanguage(prefs.spellcheckLanguage)
    })
  }

  private refresh() {
    if (this.disposed || this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      if (!this.disposed) this.view.dispatch({ effects: refreshSpellcheck.of(null) })
    })
  }
  private closeMenu() { this.menu?.remove(); this.menu = null }

  private async loadWorkshopWords(path?: string | null) {
    try {
      const workshopPath = path === undefined ? (await getPreferences()).lastWorkshopPath : path
      if (!workshopPath) {
        this.workshopPath = null; this.workshopWords.clear(); this.refresh(); return
      }
      if (workshopPath === this.workshopPath && this.workshopWords.size) return
      const dictionary = await loadWorkshopDictionary(workshopPath)
      if (this.disposed) return
      this.workshopPath = workshopPath
      this.workshopWords = new Set(dictionary.words.map(wordKey))
      this.refresh()
    } catch (error) {
      console.error('Failed to load workshop vocabulary:', error)
    }
  }

  private replace(from: number, to: number, replacement: string) {
    this.view.dispatch({ changes: { from, to, insert: replacement }, selection: { anchor: from + replacement.length } })
    this.closeMenu(); this.view.focus()
  }

  private positionMenu(menu: HTMLDivElement, anchor: HTMLElement) {
    document.body.appendChild(menu); this.menu = menu
    const target = anchor.getBoundingClientRect(), rect = menu.getBoundingClientRect()
    const left = Math.max(10, Math.min(window.innerWidth - rect.width - 10, target.left))
    const below = target.bottom + 7
    const top = below + rect.height < window.innerHeight - 10 ? below : Math.max(10, target.top - rect.height - 7)
    menu.style.left = `${left}px`; menu.style.top = `${top}px`
  }

  private addSuggestionButtons(menu: HTMLDivElement, suggestions: string[], from: number, to: number) {
    if (suggestions.length) {
      suggestions.slice(0, 5).forEach((suggestion, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'gv-spell-suggestion'; button.setAttribute('role', 'menuitem'); button.textContent = suggestion || 'Remove'
        button.addEventListener('pointerdown', event => event.stopPropagation()); button.addEventListener('click', () => this.replace(from, to, suggestion)); menu.appendChild(button)
        if (index === 0) requestAnimationFrame(() => button.focus())
      })
    } else {
      const empty = document.createElement('span'); empty.className = 'gv-spell-empty'; empty.textContent = 'No suggestions'; menu.appendChild(empty)
    }
  }

  private addDivider(menu: HTMLDivElement) { const divider = document.createElement('i'); divider.className = 'gv-spell-divider'; menu.appendChild(divider) }

  private openSpellingMenu(word: string, from: number, to: number, anchor?: HTMLElement) {
    if (!this.spell) return
    this.closeMenu()
    const menu = document.createElement('div'); menu.className = 'gv-spell-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Spelling suggestions for ${word}`)
    this.addSuggestionButtons(menu, this.spell.suggest(word), from, to); this.addDivider(menu)

    const add = document.createElement('button'); add.type = 'button'; add.className = 'gv-spell-workshop'; add.setAttribute('role', 'menuitem'); add.textContent = 'Add to workshop'
    add.addEventListener('pointerdown', event => event.stopPropagation())
    add.addEventListener('click', async () => {
      try {
        const workshopPath = (await getPreferences()).lastWorkshopPath
        if (!workshopPath) return
        const dictionary = await addWordToWorkshopDictionary(workshopPath, word)
        if (this.disposed) return
        this.workshopPath = workshopPath
        this.workshopWords = new Set(dictionary.words.map(wordKey))
        this.closeMenu(); this.refresh(); this.view.focus()
      } catch (error) { console.error('Failed to add word to workshop:', error) }
    })
    menu.appendChild(add)

    const ignore = document.createElement('button'); ignore.type = 'button'; ignore.className = 'gv-spell-ignore'; ignore.setAttribute('role', 'menuitem'); ignore.textContent = 'Ignore for now'
    ignore.addEventListener('pointerdown', event => event.stopPropagation())
    ignore.addEventListener('click', () => { this.ignored.add(wordKey(word)); this.closeMenu(); this.refresh(); this.view.focus() })
    menu.appendChild(ignore); if (anchor) this.positionMenu(menu, anchor)
  }

  private openGrammarMenu(issue: GrammarIssue, anchor?: HTMLElement) {
    this.closeMenu()
    const menu = document.createElement('div'); menu.className = 'gv-spell-menu gv-grammar-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Grammar suggestion')
    const label = document.createElement('span'); label.className = 'gv-grammar-label'; label.textContent = 'Grammar'; menu.appendChild(label)
    const message = document.createElement('span'); message.className = 'gv-grammar-message'; message.textContent = issue.message; menu.appendChild(message)
    this.addDivider(menu); this.addSuggestionButtons(menu, issue.suggestions, issue.from, issue.to); this.addDivider(menu)
    const ignore = document.createElement('button'); ignore.type = 'button'; ignore.className = 'gv-spell-ignore'; ignore.setAttribute('role', 'menuitem'); ignore.textContent = 'Ignore for now'
    ignore.addEventListener('pointerdown', event => event.stopPropagation())
    ignore.addEventListener('click', () => { this.ignoredGrammar.add(issue.ignoreKey); this.grammarIssues = this.grammarIssues.filter(item => item.ignoreKey !== issue.ignoreKey); this.closeMenu(); this.refresh(); this.view.focus() })
    menu.appendChild(ignore); if (anchor) this.positionMenu(menu, anchor)
  }

  private async ensureGrammarLinter() {
    if (this.grammarUnavailable) return null
    if (this.grammarLinter) return this.grammarLinter
    if (import.meta.env.MODE === 'web') { this.grammarUnavailable = true; return null }
    const [{ WorkerLinter, Dialect }, { binary }] = await Promise.all([import('harper.js'), import('harper.js/binary')])
    if (this.disposed) return null
    const linter = new WorkerLinter({ binary, dialect: Dialect.American }); await linter.setup(); await linter.setLintConfig({ SpellCheck: false })
    if (this.disposed) { await linter.dispose(); return null }
    this.grammarLinter = linter; return linter
  }

  private scheduleGrammar() {
    if (this.grammarTimer) clearTimeout(this.grammarTimer)
    if (this.language !== 'en' || !isAudit(this.view)) { this.grammarIssues = []; this.refresh(); return }
    this.grammarTimer = setTimeout(() => void this.runGrammar(), 220)
  }

  private async runGrammar() {
    if (this.language !== 'en' || !isAudit(this.view) || this.disposed) return
    const run = ++this.grammarRun, source = this.view.state.doc.toString()
    try {
      const linter = await this.ensureGrammarLinter()
      if (!linter || this.disposed || run !== this.grammarRun || this.language !== 'en' || !isAudit(this.view)) return
      const lints = await linter.lint(source, { language: 'markdown' })
      if (this.disposed || run !== this.grammarRun) return
      this.grammarIssues = lints.map((lint: any) => {
        const span = lint.span(), message = lint.message(), suggestions = Array.from(lint.suggestions() as Iterable<any>).map((suggestion: any) => suggestion.get_replacement_text()), marked = source.slice(span.start, span.end)
        return { from: span.start, to: span.end, message, suggestions, ignoreKey: `${marked}\u0000${message}` } as GrammarIssue
      }).filter((issue: GrammarIssue) => issue.from >= 0 && issue.to <= source.length && issue.to > issue.from && !this.ignoredGrammar.has(issue.ignoreKey))
      this.refresh()
    } catch (error) { this.grammarUnavailable = true; this.grammarIssues = []; this.refresh(); console.error('Failed to run Harper grammar check:', error) }
  }

  private async setLanguage(language: SpellcheckLanguage) {
    this.language = language; this.spell = null; this.ignored.clear(); this.ignoredGrammar.clear(); this.grammarIssues = []; this.closeMenu(); this.decorations = Decoration.none; this.refresh()
    if (language === 'off') return
    try {
      const spell = await loadDictionary(language)
      if (this.disposed || this.language !== language) return
      this.spell = spell; this.refresh(); this.scheduleGrammar()
    } catch (error) { console.error('Failed to load spellcheck dictionary:', error) }
  }

  update(update: ViewUpdate) {
    if (update.docChanged) this.scheduleGrammar()
    if (update.docChanged || update.viewportChanged || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshSpellcheck)))) {
      this.decorations = buildDecorations(update.view, this.spell, this.language, this.ignored, this.workshopWords, this.grammarIssues)
      if (update.docChanged || update.viewportChanged) this.closeMenu()
    }
  }

  destroy() {
    this.disposed = true
    if (this.grammarTimer) clearTimeout(this.grammarTimer)
    if (this.grammarLinter) void Promise.resolve(this.grammarLinter.dispose()).catch(() => {})
    this.closeMenu(); this.modeObserver.disconnect(); this.view.contentDOM.removeEventListener('pointerdown', this.pointerHandler); this.view.contentDOM.removeEventListener('focusin', this.focusHandler)
    window.removeEventListener(SPELLCHECK_LANGUAGE_EVENT, this.languageHandler); window.removeEventListener('pointerdown', this.outsideHandler); window.removeEventListener('keydown', this.keyHandler)
  }
}, { decorations: value => value.decorations })