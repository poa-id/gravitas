import { describe, expect, it } from 'vitest'
import { locateReview, type ReviewMark } from './reviewStore'

function review(selectedText: string, contextBefore = '', contextAfter = ''): ReviewMark {
  return { id: 'test', kind: 'comment', selectedText, contextBefore, contextAfter, comment: '', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('locateReview', () => {
  it('locates a unique passage', () => {
    expect(locateReview(review('workshop'), 'A quiet workshop for writing.')).toEqual({ from: 8, to: 16 })
  })

  it('uses context to disambiguate repeated passages', () => {
    const source = 'first same ending\nsecond same finish'
    const mark = review('same', 'second ', ' finish')
    expect(locateReview(mark, source)).toEqual({ from: 23, to: 27 })
  })

  it('refuses an ambiguous repeated passage instead of guessing', () => {
    expect(locateReview(review('same'), 'same and same')).toBeNull()
  })

  it('can match rendered blockquote text back to markdown source', () => {
    const source = '> This is a review\n> across two lines'
    expect(locateReview(review('This is a review across two lines'), source)).toEqual({ from: 2, to: source.length })
  })

  it('returns null when the selected passage no longer exists', () => {
    expect(locateReview(review('missing'), 'The manuscript changed.')).toBeNull()
  })
})
