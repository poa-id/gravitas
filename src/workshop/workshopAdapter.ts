import { readDir, readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'

// A single note file
export interface NoteFile {
  name: string        // display name without .md extension
  path: string        // full absolute path
  shelf: string[]     // folder path relative to workshop root e.g. ['notes', 'ideas']
  modified?: number   // timestamp, for sorting
}

// A shelf (folder) containing notes and nested shelves
export interface Shelf {
  name: string
  path: string
  notes: NoteFile[]
  shelves: Shelf[]
}

// The full workshop structure
export interface Workshop {
  path: string
  name: string        // the folder name e.g. "my-workshop"
  scratch: NoteFile[]
  folio: NoteFile[]   // daily notes
  shelves: Shelf[]
  allNotes: NoteFile[] // flat list for search
}

// Read a directory recursively and build the workshop tree
export async function loadWorkshop(rootPath: string): Promise<Workshop> {
  const name = rootPath.split('/').pop() || 'Workshop'

  // Ensure folio folder exists; scratch is now a root file, not a folder
  await ensureFolder(`${rootPath}/folio`)

  const allNotes: NoteFile[] = []
  const shelves: Shelf[] = []
  const scratch: NoteFile[] = []
  const folio: NoteFile[] = []

  // Read the root directory
  const entries = await readDir(rootPath)

  for (const entry of entries) {
    if (!entry.name) continue

    // Skip hidden files and folders
    if (entry.name.startsWith('.')) continue

    const fullPath = `${rootPath}/${entry.name}`

    if (entry.isDirectory) {
      if (entry.name === 'folio') {
        // Load daily folios
        const notes = await loadNotesFromFolder(fullPath, ['folio'])
        folio.push(...notes)
        allNotes.push(...notes)
      } else {
        // Regular shelf (includes legacy 'scratch' folder if it exists)
        const shelf = await loadShelf(fullPath, entry.name, [entry.name])
        shelves.push(shelf)
        allNotes.push(...shelf.notes)
      }
    } else if (entry.name.endsWith('.md')) {
      const noteName = entry.name.replace('.md', '')
      const note: NoteFile = { name: noteName, path: fullPath, shelf: [] }
      if (noteName === 'scratch') {
        scratch.push(note)
        // scratch.md is NOT added to allNotes — it's its own special surface
      } else {
        allNotes.push(note)
      }
    }
  }

  // Sort folio by date descending (most recent first)
  folio.sort((a, b) => b.name.localeCompare(a.name))

  return { path: rootPath, name, scratch, folio, shelves, allNotes }
}

// Load all .md files from a single folder (non-recursive)
async function loadNotesFromFolder(
  folderPath: string,
  shelf: string[]
): Promise<NoteFile[]> {
  try {
    const entries = await readDir(folderPath)
    const notes: NoteFile[] = []

    for (const entry of entries) {
      if (!entry.name) continue
      if (!entry.name.endsWith('.md')) continue
      if (entry.name.startsWith('.')) continue

      notes.push({
        name: entry.name.replace('.md', ''),
        path: `${folderPath}/${entry.name}`,
        shelf,
      })
    }

    return notes
  } catch {
    return []
  }
}

// Load a shelf (folder) recursively
async function loadShelf(
  folderPath: string,
  name: string,
  shelfPath: string[]
): Promise<Shelf> {
  const entries = await readDir(folderPath)
  const notes: NoteFile[] = []
  const shelves: Shelf[] = []

  for (const entry of entries) {
    if (!entry.name) continue
    if (entry.name.startsWith('.')) continue

    const fullPath = `${folderPath}/${entry.name}`

    if (entry.isDirectory) {
      const nested = await loadShelf(
        fullPath,
        entry.name,
        [...shelfPath, entry.name]
      )
      shelves.push(nested)
      notes.push(...nested.notes)
    } else if (entry.name.endsWith('.md')) {
      notes.push({
        name: entry.name.replace('.md', ''),
        path: fullPath,
        shelf: shelfPath,
      })
    }
  }

  return { name, path: folderPath, notes, shelves }
}

// Read a note's content
export async function readNote(path: string): Promise<string> {
  return await readTextFile(path)
}

// Write a note's content back to disk
export async function writeNote(path: string, content: string): Promise<void> {
  await writeTextFile(path, content)
}

// Create a new note file
export async function createNote(
  workshopPath: string,
  name: string,
  shelf: string[] = []
): Promise<NoteFile> {
  const folderPath = shelf.length > 0
    ? `${workshopPath}/${shelf.join('/')}`
    : workshopPath

  await ensureFolder(folderPath)

  const fileName = `${name}.md`
  const fullPath = `${folderPath}/${fileName}`
  await writeTextFile(fullPath, '')

  return { name, path: fullPath, shelf }
}

// Create today's folio note if it doesn't exist
export async function ensureTodayFolio(workshopPath: string): Promise<NoteFile> {
  const today = new Date()
  const name = today.toISOString().split('T')[0] // YYYY-MM-DD

  const folioPath = `${workshopPath}/folio`
  await ensureFolder(folioPath)

  const fullPath = `${folioPath}/${name}.md`
  const noteExists = await exists(fullPath)

  if (!noteExists) {
    await writeTextFile(fullPath, '')
  }

  return { name, path: fullPath, shelf: ['folio'] }
}

// Ensure scratch.md exists at workshop root; return its NoteFile
export async function ensureScratch(workshopPath: string): Promise<NoteFile> {
  const path = `${workshopPath}/scratch.md`
  if (!await exists(path)) {
    await writeTextFile(path, '')
  }
  return { name: 'scratch', path, shelf: [] }
}

// Helper: create a folder if it doesn't exist
async function ensureFolder(path: string): Promise<void> {
  const folderExists = await exists(path)
  if (!folderExists) {
    await mkdir(path, { recursive: true })
  }
}