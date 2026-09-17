import { createRemoteReview, revokeRemoteReview } from './reviewClient'
import { importSharedReviews } from './importReviews'
import { findShareSessionForNote, saveShareSession, type LocalShareSession } from './shareStore'

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
