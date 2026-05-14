import { load } from '@tauri-apps/plugin-store'

export interface GravitasPreferences {
  onOpen: 'resume' | 'folio' | 'overview'
  lastWorkshopPath: string | null
  lastNotePath: string | null
  knownWorkshops: string[]
}

const DEFAULTS: GravitasPreferences = {
  onOpen: 'resume',
  lastWorkshopPath: null,
  lastNotePath: null,
  knownWorkshops: [],
}

async function getStore() {
    return await load('preferences.json', {
      defaults: DEFAULTS as unknown as { [key: string]: unknown },
    })
  }

export async function getPreferences(): Promise<GravitasPreferences> {
  const store = await getStore()

  return {
    onOpen: await store.get<GravitasPreferences['onOpen']>('onOpen') ?? DEFAULTS.onOpen,
    lastWorkshopPath: await store.get<string>('lastWorkshopPath') ?? null,
    lastNotePath: await store.get<string>('lastNotePath') ?? null,
    knownWorkshops: await store.get<string[]>('knownWorkshops') ?? [],
  }
}

export async function setPreference<K extends keyof GravitasPreferences>(
  key: K,
  value: GravitasPreferences[K]
): Promise<void> {
  const store = await getStore()
  await store.set(key, value)
  await store.save()
}

// Add a workshop to the known list if not already present
export async function addKnownWorkshop(path: string): Promise<void> {
  const store = await getStore()
  const known = await store.get<string[]>('knownWorkshops') ?? []
  if (!known.includes(path)) {
    await store.set('knownWorkshops', [...known, path])
    await store.save()
  }
}