import { readDir, readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'

export interface NoteFile {
  name: string
  path: string
  shelf: string[]
  modified?: number
}

export interface Shelf {
  name: string
  path: string
  notes: NoteFile[]
  shelves: Shelf[]
}

export interface Workshop {
  path: string
  name: string
  scratch: NoteFile[]
  folio: NoteFile[]
  shelves: Shelf[]
  allNotes: NoteFile[]
}

export async function loadWorkshop(rootPath: string): Promise<Workshop> {
  const name = rootPath.split('/').pop() || 'Workshop'
  await ensureFolder(`${rootPath}/folio`)

  const allNotes: NoteFile[] = []
  const shelves: Shelf[] = []
  const scratch: NoteFile[] = []
  const folio: NoteFile[] = []
  const entries = await readDir(rootPath)

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue
    const fullPath = `${rootPath}/${entry.name}`

    if (entry.isDirectory) {
      if (entry.name === 'folio') {
        const notes = await loadNotesFromFolder(fullPath, ['folio'], true)
        folio.push(...notes)
        allNotes.push(...notes)
      } else {
        const shelf = await loadShelf(fullPath, entry.name, [entry.name])
        shelves.push(shelf)
        allNotes.push(...shelf.notes)
      }
    } else if (entry.name.endsWith('.md')) {
      const noteName = entry.name.replace('.md', '')
      const note: NoteFile = { name: noteName, path: fullPath, shelf: [] }
      if (noteName === 'scratch') scratch.push(note)
      else allNotes.push(note)
    }
  }

  folio.sort((a, b) => b.name.localeCompare(a.name))
  return { path: rootPath, name, scratch, folio, shelves, allNotes }
}

async function loadNotesFromFolder(
  folderPath: string,
  shelf: string[],
  hideEmpty = false,
): Promise<NoteFile[]> {
  try {
    const entries = await readDir(folderPath)
    const notes: NoteFile[] = []

    for (const entry of entries) {
      if (!entry.name || !entry.name.endsWith('.md') || entry.name.startsWith('.')) continue
      const path = `${folderPath}/${entry.name}`
      if (hideEmpty) {
        const content = await readTextFile(path).catch(() => '')
        if (!content.trim()) continue
      }
      notes.push({ name: entry.name.replace('.md', ''), path, shelf })
    }
    return notes
  } catch {
    return []
  }
}

async function loadShelf(folderPath: string, name: string, shelfPath: string[]): Promise<Shelf> {
  const entries = await readDir(folderPath)
  const notes: NoteFile[] = []
  const shelves: Shelf[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue
    const fullPath = `${folderPath}/${entry.name}`
    if (entry.isDirectory) {
      const nested = await loadShelf(fullPath, entry.name, [...shelfPath, entry.name])
      shelves.push(nested)
      notes.push(...nested.notes)
    } else if (entry.name.endsWith('.md')) {
      notes.push({ name: entry.name.replace('.md', ''), path: fullPath, shelf: shelfPath })
    }
  }
  return { name, path: folderPath, notes, shelves }
}

export async function readNote(path: string): Promise<string> {
  return await readTextFile(path)
}

export async function writeNote(path: string, content: string): Promise<void> {
  await writeTextFile(path, content)
}

export async function createNote(workshopPath: string, name: string, shelf: string[] = []): Promise<NoteFile> {
  const folderPath = shelf.length > 0 ? `${workshopPath}/${shelf.join('/')}` : workshopPath
  await ensureFolder(folderPath)
  const fullPath = `${folderPath}/${name}.md`
  await writeTextFile(fullPath, '')
  return { name, path: fullPath, shelf }
}

// Today's folio is virtual until the first deliberate edit. Opening Today does not create a file.
export async function ensureTodayFolio(workshopPath: string): Promise<NoteFile> {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const name = `${y}-${m}-${d}`
  const folioPath = `${workshopPath}/folio`
  await ensureFolder(folioPath)
  return { name, path: `${folioPath}/${name}.md`, shelf: ['folio'] }
}

export async function ensureScratch(workshopPath: string): Promise<NoteFile> {
  const path = `${workshopPath}/scratch.md`
  if (!await exists(path)) await writeTextFile(path, '')
  return { name: 'scratch', path, shelf: [] }
}

async function ensureFolder(path: string): Promise<void> {
  if (!await exists(path)) await mkdir(path, { recursive: true })
}
