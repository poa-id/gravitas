import { restoreWebRoot } from './fsState'

const DB_NAME = 'gravitas-web'
const STORE_NAME = 'preferences'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles')
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readAll(name: string): Promise<Record<string, unknown>> {
  const db = await openDb()
  const value = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(name)
    request.onsuccess = () => resolve(request.result ?? {})
    request.onerror = () => reject(request.error)
  })
  db.close()
  return value
}

async function writeAll(name: string, value: Record<string, unknown>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function load(name: string, options?: { defaults?: Record<string, unknown> }) {
  // Restore the directory handle before App tries to resume lastWorkshopPath.
  await restoreWebRoot().catch(() => false)
  const persisted = await readAll(name).catch(() => ({}))
  const values: Record<string, unknown> = { ...(options?.defaults ?? {}), ...persisted }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      return values[key] as T | undefined
    },
    async set(key: string, value: unknown): Promise<void> {
      values[key] = value
    },
    async save(): Promise<void> {
      await writeAll(name, values)
    },
  }
}
