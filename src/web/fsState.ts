type DirectoryHandle = any

let rootHandle: DirectoryHandle | null = null
let rootName = ''

export function setWebRoot(handle: DirectoryHandle) {
  rootHandle = handle
  rootName = handle.name
}

export function getWebRoot(): DirectoryHandle {
  if (!rootHandle) throw new Error('No workshop is open in this browser session.')
  return rootHandle
}

export function getWebRootName(): string {
  return rootName
}

export function webPathForRoot(): string {
  return `/${rootName}`
}

export function relativeSegments(path: string): string[] {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts[0] === rootName) parts.shift()
  return parts
}

export async function getDirectory(path: string, create = false): Promise<any> {
  let dir = getWebRoot()
  for (const segment of relativeSegments(path)) {
    dir = await dir.getDirectoryHandle(segment, { create })
  }
  return dir
}

export async function getParentAndName(path: string): Promise<{ parent: any; name: string }> {
  const segments = relativeSegments(path)
  const name = segments.pop()
  if (!name) throw new Error(`Invalid path: ${path}`)
  let parent = getWebRoot()
  for (const segment of segments) {
    parent = await parent.getDirectoryHandle(segment)
  }
  return { parent, name }
}
