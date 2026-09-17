import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

export type ReviewKind = 'comment' | 'revisit' | 'question' | 'cut'
export type ReviewStatus = 'open' | 'resolved'

export interface ReviewMark {
  id: string
  kind: ReviewKind
  selectedText: string
  contextBefore: string
  contextAfter: string
  comment: string
  status: ReviewStatus
  createdAt: string
  resolvedAt?: string
  reviewerName?: string
  reviewSessionId?: string
  reviewSubmissionId?: string
}

function parts(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return { dir: normalized.slice(0, slash), file: normalized.slice(slash + 1).replace(/\.md$/i, '') }
}

function reviewPath(notePath: string) {
  const { dir, file } = parts(notePath)
  return { folder: `${dir}/.gravitas/reviews`, file: `${dir}/.gravitas/reviews/${file}.json` }
}

export async function loadReviews(notePath: string): Promise<ReviewMark[]> {
  const path = reviewPath(notePath).file
  if (!(await exists(path))) return []
  try {
    const parsed = JSON.parse(await readTextFile(path))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveReviews(notePath: string, reviews: ReviewMark[]): Promise<void> {
  const path = reviewPath(notePath)
  if (!(await exists(path.folder))) await mkdir(path.folder, { recursive: true })
  await writeTextFile(path.file, JSON.stringify(reviews, null, 2))
}

export function makeReview(kind: ReviewKind, selectedText: string, source: string, comment = ''): ReviewMark {
  const needle = selectedText.trim()
  const at = source.indexOf(needle)
  const before = at >= 0 ? source.slice(Math.max(0, at - 64), at) : ''
  const after = at >= 0 ? source.slice(at + needle.length, at + needle.length + 64) : ''
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    selectedText: needle,
    contextBefore: before,
    contextAfter: after,
    comment: comment.trim(),
    status: 'open',
    createdAt: new Date().toISOString(),
  }
}

function markdownFlexibleMatch(needle: string, source: string): { from: number; to: number } | null {
  const tokens = needle.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return null
  let searchFrom = 0
  while (searchFrom < source.length) {
    const first = source.indexOf(tokens[0], searchFrom)
    if (first < 0) return null
    let cursor = first + tokens[0].length
    let matched = true
    for (let i = 1; i < tokens.length; i++) {
      // Read mode hides Markdown blockquote syntax. Between visible words the raw
      // source may therefore contain whitespace plus one or more `>` markers.
      // Keep the returned range in raw Markdown coordinates so CodeMirror can
      // select and edit the actual source in Audit.
      const separator = source.slice(cursor).match(/^(?:\s|>)+/)
      if (!separator) { matched = false; break }
      cursor += separator[0].length
      if (!source.startsWith(tokens[i], cursor)) { matched = false; break }
      cursor += tokens[i].length
    }
    if (matched) return { from: first, to: cursor }
    searchFrom = first + Math.max(1, tokens[0].length)
  }
  return null
}

export function locateReview(review: ReviewMark, source: string): { from: number; to: number } | null {
  const matches: number[] = []
  let from = 0
  while (from <= source.length) {
    const at = source.indexOf(review.selectedText, from)
    if (at < 0) break
    matches.push(at)
    from = at + Math.max(1, review.selectedText.length)
  }
  if (!matches.length) return markdownFlexibleMatch(review.selectedText, source)
  if (matches.length === 1) return { from: matches[0], to: matches[0] + review.selectedText.length }
  let best = matches[0], bestScore = -1
  for (const at of matches) {
    const before = source.slice(Math.max(0, at - review.contextBefore.length), at)
    const after = source.slice(at + review.selectedText.length, at + review.selectedText.length + review.contextAfter.length)
    let score = 0
    for (let i = 1; i <= Math.min(before.length, review.contextBefore.length); i++) {
      if (before[before.length - i] === review.contextBefore[review.contextBefore.length - i]) score++
    }
    for (let i = 0; i < Math.min(after.length, review.contextAfter.length); i++) if (after[i] === review.contextAfter[i]) score++
    if (score > bestScore) { best = at; bestScore = score }
  }
  return { from: best, to: best + review.selectedText.length }
}
