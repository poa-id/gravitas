import { writeTextFile, mkdir, exists, rename } from '@tauri-apps/plugin-fs'
import type { NoteFile } from './workshopAdapter'

export function titleToFilename(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    || 'untitled'
}

export function extractTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim()
  if (!firstLine) return 'untitled'
  return firstLine.replace(/^#+\s*/, '').trim() || 'untitled'
}

export async function createNewNote(
  workshopPath: string,
  shelf: string[] = []
): Promise<NoteFile> {
  const folderPath = shelf.length > 0
    ? `${workshopPath}/${shelf.join('/')}`
    : workshopPath

  const folderExists = await exists(folderPath)
  if (!folderExists) {
    await mkdir(folderPath, { recursive: true })
  }

  let filename = 'untitled'
  let counter = 0
  let fullPath = `${folderPath}/${filename}.md`

  while (await exists(fullPath)) {
    counter++
    filename = `untitled-${counter}`
    fullPath = `${folderPath}/${filename}.md`
  }

  await writeTextFile(fullPath, '')

  return { name: filename, path: fullPath, shelf }
}

// Renames the file on disk and returns the new NoteFile
// Returns null if rename is not possible (collision, same name, folio)
export async function renameNoteOnDisk(
  note: NoteFile,
  newTitle: string,
  workshopPath: string
): Promise<NoteFile | null> {
  const newFilename = titleToFilename(newTitle)
  if (!newFilename || newFilename === 'untitled') return null

  const folderPath = note.shelf.length > 0
    ? `${workshopPath}/${note.shelf.join('/')}`
    : workshopPath

  const newPath = `${folderPath}/${newFilename}.md`

  if (newPath === note.path) return null
  if (await exists(newPath)) return null

  await rename(note.path, newPath)

  return { name: newFilename, path: newPath, shelf: note.shelf }
}
