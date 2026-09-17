import { readDir, readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'

export interface NoteFile { name: string; path: string; shelf: string[]; modified?: number }
export interface Shelf { name: string; path: string; notes: NoteFile[]; shelves: Shelf[] }
export interface Workshop { path: string; name: string; scratch: NoteFile[]; folio: NoteFile[]; shelves: Shelf[]; allNotes: NoteFile[] }
export interface WorkshopDictionary { words: string[] }

export async function loadWorkshop(rootPath: string): Promise<Workshop> {
  const name = rootPath.split('/').pop() || 'Workshop'
  await ensureFolder(`${rootPath}/folio`)
  const allNotes: NoteFile[] = [], shelves: Shelf[] = [], scratch: NoteFile[] = [], folio: NoteFile[] = []
  const entries = await readDir(rootPath)
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue
    const fullPath = `${rootPath}/${entry.name}`
    if (entry.isDirectory) {
      if (entry.name === 'folio') {
        const notes = await loadNotesFromFolder(fullPath, ['folio'], true)
        folio.push(...notes); allNotes.push(...notes)
      } else {
        const shelf = await loadShelf(fullPath, entry.name, [entry.name])
        shelves.push(shelf); allNotes.push(...shelf.notes)
      }
    } else if (entry.name.endsWith('.md')) {
      const noteName = entry.name.replace('.md', '')
      const note: NoteFile = { name: noteName, path: fullPath, shelf: [] }
      if (noteName === 'scratch') scratch.push(note); else allNotes.push(note)
    }
  }
  folio.sort((a, b) => b.name.localeCompare(a.name))
  return { path: rootPath, name, scratch, folio, shelves, allNotes }
}

async function loadNotesFromFolder(folderPath: string, shelf: string[], hideEmpty = false): Promise<NoteFile[]> {
  try {
    const entries = await readDir(folderPath), notes: NoteFile[] = []
    for (const entry of entries) {
      if (!entry.name || !entry.name.endsWith('.md') || entry.name.startsWith('.')) continue
      const path = `${folderPath}/${entry.name}`
      if (hideEmpty && !(await readTextFile(path).catch(() => '')).trim()) continue
      notes.push({ name: entry.name.replace('.md', ''), path, shelf })
    }
    return notes
  } catch { return [] }
}

async function loadShelf(folderPath: string, name: string, shelfPath: string[]): Promise<Shelf> {
  const entries = await readDir(folderPath), notes: NoteFile[] = [], shelves: Shelf[] = []
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue
    const fullPath = `${folderPath}/${entry.name}`
    if (entry.isDirectory) {
      const nested = await loadShelf(fullPath, entry.name, [...shelfPath, entry.name])
      shelves.push(nested); notes.push(...nested.notes)
    } else if (entry.name.endsWith('.md')) notes.push({ name: entry.name.replace('.md', ''), path: fullPath, shelf: shelfPath })
  }
  return { name, path: folderPath, notes, shelves }
}

export async function readNote(path: string): Promise<string> {
  try { return await readTextFile(path) }
  catch (err) {
    // A daily folio may be virtual: merely opening Today must not create a file.
    if (/\/folio\/\d{4}-\d{2}-\d{2}\.md$/.test(path.replace(/\\/g, '/'))) return ''
    throw err
  }
}
export async function writeNote(path: string, content: string): Promise<void> { await writeTextFile(path, content) }

export async function createNote(workshopPath: string, name: string, shelf: string[] = []): Promise<NoteFile> {
  const folderPath = shelf.length ? `${workshopPath}/${shelf.join('/')}` : workshopPath
  await ensureFolder(folderPath)
  const fullPath = `${folderPath}/${name}.md`
  await writeTextFile(fullPath, '')
  return { name, path: fullPath, shelf }
}

// Today exists in the UI before it exists on disk. First deliberate input materializes the .md file.
export async function ensureTodayFolio(workshopPath: string): Promise<NoteFile> {
  const now = new Date(), y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0')
  const name = `${y}-${m}-${d}`, folioPath = `${workshopPath}/folio`
  await ensureFolder(folioPath)
  return { name, path: `${folioPath}/${name}.md`, shelf: ['folio'] }
}

export async function ensureScratch(workshopPath: string): Promise<NoteFile> {
  const path = `${workshopPath}/scratch.md`
  if (!await exists(path)) await writeTextFile(path, '')
  return { name: 'scratch', path, shelf: [] }
}

export async function loadWorkshopDictionary(workshopPath: string): Promise<WorkshopDictionary> {
  const path = `${workshopPath}/.gravitas/dictionary.json`
  if (!await exists(path)) return { words: [] }
  try {
    const parsed = JSON.parse(await readTextFile(path)) as Partial<WorkshopDictionary>
    const words = Array.isArray(parsed.words)
      ? parsed.words.filter((word): word is string => typeof word === 'string' && word.trim().length > 0)
      : []
    return { words }
  } catch (error) {
    console.error('Failed to read workshop dictionary:', error)
    return { words: [] }
  }
}

export async function addWordToWorkshopDictionary(workshopPath: string, word: string): Promise<WorkshopDictionary> {
  const clean = word.trim()
  const current = await loadWorkshopDictionary(workshopPath)
  if (!clean) return current
  const existsAlready = current.words.some(existing => existing.toLocaleLowerCase() === clean.toLocaleLowerCase())
  if (existsAlready) return current

  const next = { words: [...current.words, clean].sort((a, b) => a.localeCompare(b)) }
  const folder = `${workshopPath}/.gravitas`
  await ensureFolder(folder)
  await writeTextFile(`${folder}/dictionary.json`, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

async function ensureFolder(path: string): Promise<void> { if (!await exists(path)) await mkdir(path, { recursive: true }) }
