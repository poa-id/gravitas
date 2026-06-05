import { rename, mkdir, exists } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import type { NoteFile } from './workshopAdapter'

// Move a note to the OS trash
export async function trashNote(note: NoteFile): Promise<void> {
  console.log('[trashNote] called with path:', note.path)
  try {
    await invoke('trash_file', { path: note.path })
    console.log('[trashNote] succeeded')
  } catch (err) {
    console.error('[trashNote] invoke trash_file failed:', err)
    throw err
  }
}

// Move a note to a different shelf
export async function moveNote(
  note: NoteFile,
  targetShelf: string[],
  workshopPath: string
): Promise<NoteFile> {
  const targetFolder = targetShelf.length > 0
    ? `${workshopPath}/${targetShelf.join('/')}`
    : workshopPath

  const folderExists = await exists(targetFolder)
  if (!folderExists) {
    await mkdir(targetFolder, { recursive: true })
  }

  const newPath = `${targetFolder}/${note.name}.md`

  if (newPath === note.path) return note
  if (await exists(newPath)) {
    throw new Error(`A note named "${note.name}" already exists in that shelf.`)
  }

  await rename(note.path, newPath)
  return { name: note.name, path: newPath, shelf: targetShelf }
}

// Create a new shelf (folder)
export async function createShelf(
  workshopPath: string,
  shelfName: string
): Promise<void> {
  const folderPath = `${workshopPath}/${shelfName}`
  const folderExists = await exists(folderPath)
  if (folderExists) throw new Error(`Shelf "${shelfName}" already exists.`)
  await mkdir(folderPath, { recursive: true })
}

// Rename a shelf folder on disk
export async function renameShelf(
  workshopPath: string,
  oldName: string,
  newName: string
): Promise<void> {
  const oldPath = `${workshopPath}/${oldName}`
  const newPath = `${workshopPath}/${newName}`
  if (await exists(newPath)) throw new Error(`A shelf named "${newName}" already exists.`)
  await rename(oldPath, newPath)
}

// Move a shelf (and all its contents) to the OS trash
export async function trashShelf(shelfPath: string): Promise<void> {
  await invoke('trash_file', { path: shelfPath })
}

// Reveal a note in Finder / Explorer
export async function revealInFinder(note: NoteFile): Promise<void> {
  console.log('[revealInFinder] called with path:', note.path)
  try {
    await revealItemInDir(note.path)
    console.log('[revealInFinder] succeeded')
  } catch (err) {
    console.error('[revealInFinder] revealItemInDir failed:', err)
    throw err
  }
}
