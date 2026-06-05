import { Menu, MenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import type { NoteFile, Workshop } from '../workshop/workshopAdapter'

export interface ContextMenuActions {
  onDelete: (note: NoteFile) => void
  onMove: (note: NoteFile, targetShelf: string[]) => void
  onReveal: (note: NoteFile) => void
  onRename: (note: NoteFile) => void
}

export async function showNoteContextMenu(
  note: NoteFile,
  workshop: Workshop,
  actions: ContextMenuActions
): Promise<void> {
  const isFolio = note.shelf.includes('folio')
  const items: (MenuItem | Submenu | PredefinedMenuItem)[] = []

  // Rename — folios have a meaningful date filename, so skip rename for them
  if (!isFolio) {
    items.push(
      await MenuItem.new({
        text: 'Rename',
        action: () => actions.onRename(note),
      })
    )
  }

  // Move to — available for all notes including folios (a folio moved to a shelf becomes a regular note)
  const moveTargets = getMoveTargets(note, workshop)
  if (moveTargets.length > 0) {
    if (items.length > 0) items.push(await PredefinedMenuItem.new({ item: 'Separator' }))
    const moveItems = await Promise.all(
      moveTargets.map(t =>
        MenuItem.new({
          text: t.label,
          action: () => actions.onMove(note, t.shelf),
        })
      )
    )
    const moveSubmenu = await Submenu.new({ text: 'Move to', items: moveItems })
    items.push(moveSubmenu)
  }

  // Reveal in Finder — always
  if (items.length > 0) items.push(await PredefinedMenuItem.new({ item: 'Separator' }))
  items.push(
    await MenuItem.new({
      text: 'Reveal in Finder',
      action: () => actions.onReveal(note),
    })
  )

  // Delete — available for all notes including folios
  items.push(await PredefinedMenuItem.new({ item: 'Separator' }))
  items.push(
    await MenuItem.new({
      text: 'Delete',
      action: () => actions.onDelete(note),
    })
  )

  const menu = await Menu.new({ items })
  await menu.popup()
}

interface MoveTarget {
  label: string
  shelf: string[]
}

function getMoveTargets(note: NoteFile, workshop: Workshop): MoveTarget[] {
  const targets: MoveTarget[] = []
  const currentShelf = note.shelf.join('/')

  // Scratch — available unless already in scratch
  if (currentShelf !== 'scratch') {
    targets.push({ label: 'Scratch', shelf: ['scratch'] })
  }

  // Each user shelf — available unless already on that shelf
  for (const shelf of workshop.shelves) {
    if (currentShelf !== shelf.name) {
      targets.push({ label: shelf.name, shelf: [shelf.name] })
    }
  }

  // Workshop root — only for notes that are already on a named shelf (not folio/scratch)
  if (note.shelf.length > 0 && !note.shelf.includes('folio') && !note.shelf.includes('scratch')) {
    targets.push({ label: 'Workshop root', shelf: [] })
  }

  return targets
}
