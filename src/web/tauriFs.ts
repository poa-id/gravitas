import { getDirectory, getParentAndName, relativeSegments, getWebRoot } from './fsState'

export interface DirEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export async function readDir(path: string): Promise<DirEntry[]> {
  const dir = relativeSegments(path).length === 0 ? getWebRoot() : await getDirectory(path)
  const out: DirEntry[] = []
  for await (const [name, handle] of dir.entries()) {
    out.push({ name, isDirectory: handle.kind === 'directory', isFile: handle.kind === 'file' })
  }
  return out
}

export async function readTextFile(path: string): Promise<string> {
  const { parent, name } = await getParentAndName(path)
  const handle = await parent.getFileHandle(name)
  const file = await handle.getFile()
  return await file.text()
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  const { parent, name } = await getParentAndName(path)
  const handle = await parent.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
  if (options?.recursive) {
    await getDirectory(path, true)
    return
  }
  const { parent, name } = await getParentAndName(path)
  await parent.getDirectoryHandle(name, { create: true })
}

export async function exists(path: string): Promise<boolean> {
  if (relativeSegments(path).length === 0) return true
  try {
    const { parent, name } = await getParentAndName(path)
    try { await parent.getFileHandle(name); return true } catch {}
    try { await parent.getDirectoryHandle(name); return true } catch {}
    return false
  } catch {
    return false
  }
}

async function copyDirectory(source: any, target: any): Promise<void> {
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      const dest = await target.getFileHandle(name, { create: true })
      const writable = await dest.createWritable()
      await writable.write(await file.arrayBuffer())
      await writable.close()
    } else {
      const child = await target.getDirectoryHandle(name, { create: true })
      await copyDirectory(handle, child)
    }
  }
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  const oldLoc = await getParentAndName(oldPath)
  const newLoc = await getParentAndName(newPath)

  try {
    const sourceFile = await oldLoc.parent.getFileHandle(oldLoc.name)
    const file = await sourceFile.getFile()
    const dest = await newLoc.parent.getFileHandle(newLoc.name, { create: true })
    const writable = await dest.createWritable()
    await writable.write(await file.arrayBuffer())
    await writable.close()
    await oldLoc.parent.removeEntry(oldLoc.name)
    return
  } catch {}

  const sourceDir = await oldLoc.parent.getDirectoryHandle(oldLoc.name)
  const targetDir = await newLoc.parent.getDirectoryHandle(newLoc.name, { create: true })
  await copyDirectory(sourceDir, targetDir)
  await oldLoc.parent.removeEntry(oldLoc.name, { recursive: true })
}

export async function remove(path: string, options?: { recursive?: boolean }): Promise<void> {
  const { parent, name } = await getParentAndName(path)
  await parent.removeEntry(name, { recursive: options?.recursive ?? false })
}
