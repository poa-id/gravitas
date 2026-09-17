import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

export interface LocalShareSession {
  id: string
  notePath: string
  title: string
  url: string
  ownerKey: string
  createdAt: string
  expiresAt: string
  snapshotSha256: string
  importedSubmissionIds: string[]
}

function safeFileName(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function sharesFolder(workshopPath: string) {
  return `${workshopPath}/.gravitas/shares`
}

function sharePath(workshopPath: string, id: string) {
  return `${sharesFolder(workshopPath)}/${safeFileName(id)}.json`
}

export async function saveShareSession(workshopPath: string, session: LocalShareSession): Promise<void> {
  const folder = sharesFolder(workshopPath)
  if (!(await exists(folder))) await mkdir(folder, { recursive: true })
  await writeTextFile(sharePath(workshopPath, session.id), `${JSON.stringify(session, null, 2)}\n`)
}

export async function loadShareSession(workshopPath: string, id: string): Promise<LocalShareSession | null> {
  const path = sharePath(workshopPath, id)
  if (!(await exists(path))) return null
  try {
    const parsed = JSON.parse(await readTextFile(path)) as LocalShareSession
    if (!parsed?.id || !parsed.ownerKey || !parsed.notePath) return null
    return { ...parsed, importedSubmissionIds: Array.isArray(parsed.importedSubmissionIds) ? parsed.importedSubmissionIds : [] }
  } catch {
    return null
  }
}

export async function markSubmissionImported(workshopPath: string, session: LocalShareSession, submissionId: string): Promise<LocalShareSession> {
  if (session.importedSubmissionIds.includes(submissionId)) return session
  const next = { ...session, importedSubmissionIds: [...session.importedSubmissionIds, submissionId] }
  await saveShareSession(workshopPath, next)
  return next
}
