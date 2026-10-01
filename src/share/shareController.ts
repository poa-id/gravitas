import { createRemoteReview, revokeRemoteReview } from './reviewClient'
import { importSharedReviews } from './importReviews'
import { findShareSessionForNote, listShareSessions, markAllSubmissionsSeen, saveShareSession, type LocalShareSession } from './shareStore'

export async function createShareForNote(workshopPath: string, notePath: string, title: string, markdown: string): Promise<LocalShareSession> {
  const remote = await createRemoteReview(title, markdown)
  const session: LocalShareSession = {
    id: remote.id,
    notePath,
    title,
    url: remote.url,
    ownerKey: remote.ownerKey,
    createdAt: remote.createdAt,
    expiresAt: remote.expiresAt,
    snapshotSha256: remote.snapshotSha256,
    importedSubmissionIds: [],
    unseenSubmissionIds: [],
  }
  await saveShareSession(workshopPath, session)
  return session
}

export async function getShareForNote(workshopPath: string, notePath: string): Promise<LocalShareSession | null> {
  return findShareSessionForNote(workshopPath, notePath)
}

export async function refreshShare(workshopPath: string, session: LocalShareSession) {
  return importSharedReviews(workshopPath, session)
}

export async function revokeShare(session: LocalShareSession): Promise<void> {
  await revokeRemoteReview(session.id, session.ownerKey)
}

export function shareExpired(session: LocalShareSession): boolean {
  return Date.now() >= new Date(session.expiresAt).getTime()
}


export interface IncomingReviewSync {
  importedSubmissions: number
  importedMarks: number
  reviewers: string[]
  notePaths: string[]
  unseenSubmissions: number
}

export async function syncActiveShares(workshopPath: string): Promise<IncomingReviewSync> {
  const sessions = (await listShareSessions(workshopPath)).filter(session => !shareExpired(session))
  let importedSubmissions = 0
  let importedMarks = 0
  const reviewers = new Set<string>()
  const notePaths = new Set<string>()

  for (const session of sessions) {
    try {
      const result = await importSharedReviews(workshopPath, session)
      if (result.importedSubmissions) {
        importedSubmissions += result.importedSubmissions
        importedMarks += result.importedMarks
        result.reviewers.forEach(name => reviewers.add(name))
        notePaths.add(session.notePath)
      }
    } catch {
      // Background review sync is deliberately quiet. Manual refresh remains the
      // place where network/service errors are surfaced to the writer.
    }
  }

  const refreshed = await listShareSessions(workshopPath)
  return {
    importedSubmissions,
    importedMarks,
    reviewers: [...reviewers],
    notePaths: [...notePaths],
    unseenSubmissions: refreshed.reduce((sum, session) => sum + session.unseenSubmissionIds.length, 0),
  }
}

export async function countUnseenReviews(workshopPath: string): Promise<number> {
  return (await listShareSessions(workshopPath)).reduce((sum, session) => sum + session.unseenSubmissionIds.length, 0)
}

export async function markIncomingReviewsSeen(workshopPath: string): Promise<void> {
  await markAllSubmissionsSeen(workshopPath)
}
