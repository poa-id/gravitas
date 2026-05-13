import { ViewPlugin, Decoration, DecorationSet, ViewUpdate, MatchDecorator, WidgetType } from '@codemirror/view'
import { EditorView } from '@codemirror/view'

class WikilinkWidget extends WidgetType {
  constructor(readonly text: string) { super() }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'gv-wikilink'
    span.textContent = this.text
    span.title = `Open: ${this.text}`
    return span
  }

  ignoreEvent() { return false }
}

const wikilinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\]]+)\]\]/g,
  decoration: (match) =>
    Decoration.replace({
      widget: new WikilinkWidget(match[1]),
    }),
})

export const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = wikilinkMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.decorations = wikilinkMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (v) => v.decorations }
)
