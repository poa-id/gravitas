import { loadReviews, saveReviews, type ReviewMark } from '../review/reviewStore'
import { fetchReviewResults } from './reviewClient'
import { markSubmissionImported, type LocalShareSession } from './shareStore'

export interface ImportResult {
  session: LocalShareSession
  importedSubmissions: number
  importedMarks: number
}

export async function importSharedReviews(workshopPath: string, session: LocalShareSession): Promise<ImportResult> {
  const remote = await fetchReviewResults(session.id, session.ownerKey)
  let currentSession = session
  let importedSubmissions = 0
  let importedMarks = 0
  const existing = await loadReviews(session.notePath)
  const existingIds = new Set(existing.map(mark => mark.id))
  const additions: ReviewMark[] = []

  for (const submission of remote.submissions) {
    if (currentSession.importedSubmissionIds.includes(submission.id)) continue
    for (const mark of submission.marks) {
      const localId = `shared:${submission.id}:${mark.id}`
      if (existingIds.has(localId)) continue
      additions.push({
        ...mark,
        id: localId,
        status: 'open',
        resolvedAt: undefined,
        reviewerName: submission.reviewerName,
        reviewSessionId: session.id,
        reviewSubmissionId: submission.id,
      })
      existingIds.add(localId)
      importedMarks++
    }
    currentSession = await markSubmissionImported(workshopPath, currentSession, submission.id)
    importedSubmissions++
  }

  if (additions.length) await saveReviews(session.notePath, [...existing, ...additions])
  return { session: currentSession, importedSubmissions, importedMarks }
}
