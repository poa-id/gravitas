import { writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import type { NoteFile } from './workshopAdapter'

// Sanitize a title into a valid filename
export function titleToFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // remove special chars
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '')          // trim leading/trailing hyphens
    .slice(0, 60)                   // max 60 chars
    || 'untitled'                   // fallback
}

// Extract title from first line of content
// Handles: # Heading, ## Heading, or plain first line
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

  // Ensure folder exists
  const folderExists = await exists(folderPath)
  if (!folderExists) {
    await mkdir(folderPath, { recursive: true })
  }

  // Find a unique filename
  let filename = 'untitled'
  let counter = 0
  let fullPath = `${folderPath}/${filename}.md`

  while (await exists(fullPath)) {
    counter++
    filename = `untitled-${counter}`
    fullPath = `${folderPath}/${filename}.md`
  }

  await writeTextFile(fullPath, '')

  return {
    name: filename,
    path: fullPath,
    shelf,
  }
}

// Rename a note file when its title changes
export async function renameNoteFromTitle(
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

  // Don't rename if same name
  if (newPath === note.path) return null

  // Don't rename if target already exists
  if (await exists(newPath)) return null

  return {
    name: newFilename,
    path: newPath,
    shelf: note.shelf,
  }
}