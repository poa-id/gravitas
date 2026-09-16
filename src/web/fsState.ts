type DirectoryHandle = any

let rootHandle: DirectoryHandle | null = null
let rootName = ''
const DB_NAME = 'gravitas-web'
const STORE_NAME = 'handles'
const ROOT_KEY = 'workshop-root'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storeHandle(handle: DirectoryHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, ROOT_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function readStoredHandle(): Promise<DirectoryHandle | null> {
  const db = await openDb()
  const value = await new Promise<DirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(ROOT_KEY)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return value
}

export async function setWebRoot(handle: DirectoryHandle) {
  rootHandle = handle
  rootName = handle.name
  await storeHandle(handle)
}

export async function restoreWebRoot(): Promise<boolean> {
  if (rootHandle) return true
  const handle = await readStoredHandle().catch(() => null)
  if (!handle) return false

  const permission = typeof handle.queryPermission === 'function'
    ? await handle.queryPermission({ mode: 'readwrite' })
    : 'granted'

  if (permission !== 'granted') return false
  rootHandle = handle
  rootName = handle.name
  return true
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
