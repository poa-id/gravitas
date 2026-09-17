import type { ReviewMark } from '../review/reviewStore'

const REVIEW_API_URL = (import.meta.env.VITE_REVIEW_API_URL as string | undefined)?.replace(/\/$/, '') || ''

export interface CreatedReview {
  id: string
  url: string
  ownerKey: string
  createdAt: string
  expiresAt: string
  snapshotSha256: string
}

export interface ReviewSubmission {
  id: string
  reviewerName: string
  reviewerNote: string
  marks: ReviewMark[]
  createdAt: string
}

export interface ReviewResults {
  id: string
  title: string
  createdAt: string
  expiresAt: string
  snapshotSha256: string
  submissions: ReviewSubmission[]
}

function endpoint(path: string) {
  if (!REVIEW_API_URL) throw new Error('Review service is not configured.')
  return `${REVIEW_API_URL}${path}`
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  let message = `Review service returned ${response.status}`
  try {
    const body = await response.json() as { error?: string }
    if (body.error) message = body.error
  } catch { /* keep status message */ }
  throw new Error(message)
}

export function reviewServiceConfigured() {
  return Boolean(REVIEW_API_URL)
}

export async function createRemoteReview(title: string, markdown: string): Promise<CreatedReview> {
  const response = await fetch(endpoint('/api/reviews'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, markdown }),
  })
  return parse<CreatedReview>(response)
}

export async function fetchReviewResults(id: string, ownerKey: string): Promise<ReviewResults> {
  const response = await fetch(endpoint(`/api/owner/reviews/${encodeURIComponent(id)}`), {
    headers: { authorization: `Bearer ${ownerKey}` },
  })
  return parse<ReviewResults>(response)
}

export async function revokeRemoteReview(id: string, ownerKey: string): Promise<void> {
  const response = await fetch(endpoint(`/api/owner/reviews/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${ownerKey}` },
  })
  if (!response.ok && response.status !== 404 && response.status !== 410) await parse(response)
}
