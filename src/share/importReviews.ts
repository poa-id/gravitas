import { loadReviews, saveReviews, type ReviewMark } from '../review/reviewStore'
import { fetchReviewResults } from './reviewClient'
import { markSubmissionsImported, type LocalShareSession } from './shareStore'

export interface ImportResult {
  session: LocalShareSession
  importedSubmissions: number
  importedMarks: number
}

export async function importSharedReviews(workshopPath: string, session: LocalShareSession): Promise<ImportResult> {
  const remote = await fetchReviewResults(session.id, session.ownerKey)
  const existing = await loadReviews(session.notePath)
  const existingIds = new Set(existing.map(mark => mark.id))
  const additions: ReviewMark[] = []
  const importedSubmissionIds: string[] = []
  let importedMarks = 0

  for (const submission of remote.submissions) {
    if (session.importedSubmissionIds.includes(submission.id)) continue

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

    importedSubmissionIds.push(submission.id)
  }

  // The review file is the durable local copy. Never mark a remote submission as
  // imported until its marks have been safely written, otherwise a failed write
  // could make a later refresh skip feedback that never reached the workshop.
  if (additions.length) await saveReviews(session.notePath, [...existing, ...additions])
  const currentSession = await markSubmissionsImported(workshopPath, session, importedSubmissionIds)

  return {
    session: currentSession,
    importedSubmissions: importedSubmissionIds.length,
    importedMarks,
  }
}
