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

export function locateReview(review: ReviewMark, source: string): { from: number; to: number } | null {
  const matches: number[] = []
  let from = 0
  while (from <= source.length) {
    const at = source.indexOf(review.selectedText, from)
    if (at < 0) break
    matches.push(at)
    from = at + Math.max(1, review.selectedText.length)
  }
  if (!matches.length) return null
  if (matches.length === 1) return { from: matches[0], to: matches[0] + review.selectedText.length }
  let best = matches[0], bestScore = -1
  for (const at of matches) {
    const before = source.slice(Math.max(0, at - review.contextBefore.length), at)
    const after = source.slice(at + review.selectedText.length, at + review.selectedText.length + review.contextAfter.length)
    let score = 0
    for (let i = 1; i <= Math.min(before.length, review.contextBefore.length); i++) if (before.at(-i) === review.contextBefore.at(-i)) score++
    for (let i = 0; i < Math.min(after.length, review.contextAfter.length); i++) if (after[i] === review.contextAfter[i]) score++
    if (score > bestScore) { best = at; bestScore = score }
  }
  return { from: best, to: best + review.selectedText.length }
}
