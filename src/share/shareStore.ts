import { exists, mkdir, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

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

function normalize(parsed: LocalShareSession): LocalShareSession | null {
  if (!parsed?.id || !parsed.ownerKey || !parsed.notePath) return null
  return { ...parsed, importedSubmissionIds: Array.isArray(parsed.importedSubmissionIds) ? parsed.importedSubmissionIds : [] }
}

export async function saveShareSession(workshopPath: string, session: LocalShareSession): Promise<void> {
  const folder = sharesFolder(workshopPath)
  if (!(await exists(folder))) await mkdir(folder, { recursive: true })
  await writeTextFile(sharePath(workshopPath, session.id), `${JSON.stringify(session, null, 2)}\n`)
}

export async function loadShareSession(workshopPath: string, id: string): Promise<LocalShareSession | null> {
  const path = sharePath(workshopPath, id)
  if (!(await exists(path))) return null
  try { return normalize(JSON.parse(await readTextFile(path)) as LocalShareSession) }
  catch { return null }
}

export async function findShareSessionForNote(workshopPath: string, notePath: string): Promise<LocalShareSession | null> {
  const folder = sharesFolder(workshopPath)
  if (!(await exists(folder))) return null
  try {
    const entries = await readDir(folder)
    const sessions: LocalShareSession[] = []
    for (const entry of entries) {
      if (!entry.name?.endsWith('.json') || entry.isDirectory) continue
      try {
        const parsed = normalize(JSON.parse(await readTextFile(`${folder}/${entry.name}`)) as LocalShareSession)
        if (parsed?.notePath === notePath) sessions.push(parsed)
      } catch { /* malformed share files do not block the workshop */ }
    }
    sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return sessions[0] ?? null
  } catch {
    return null
  }
}

export async function markSubmissionsImported(workshopPath: string, session: LocalShareSession, submissionIds: string[]): Promise<LocalShareSession> {
  if (!submissionIds.length) return session
  const imported = new Set(session.importedSubmissionIds)
  submissionIds.forEach(id => imported.add(id))
  const next = { ...session, importedSubmissionIds: [...imported] }
  await saveShareSession(workshopPath, next)
  return next
}

export async function markSubmissionImported(workshopPath: string, session: LocalShareSession, submissionId: string): Promise<LocalShareSession> {
  return markSubmissionsImported(workshopPath, session, [submissionId])
}
