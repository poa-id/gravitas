import { ViewPlugin, Decoration, DecorationSet, ViewUpdate, MatchDecorator, WidgetType } from '@codemirror/view'
import { EditorView } from '@codemirror/view'

// Renders ?? prefix as a quiet margin mark
class QuestionMarkWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.className = 'gv-question-mark'
    span.textContent = '?'
    span.title = 'Open question'
    return span
  }
  ignoreEvent() { return false }
}

const questionMatcher = new MatchDecorator({
  regexp: /^\?\? /gm,
  decoration: () =>
    Decoration.replace({
      widget: new QuestionMarkWidget(),
    }),
})

export const openQuestionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = questionMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
      this.decorations = questionMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (v) => v.decorations }
)
