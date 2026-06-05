import { load } from '@tauri-apps/plugin-store'

export interface GravitasPreferences {
  onOpen: 'resume' | 'folio'
  lastWorkshopPath: string | null
  lastNotePath: string | null
  knownWorkshops: string[]
  soundEnabled: boolean
  pasteIntentEnabled: boolean
  seenScratchToast: boolean
}

const DEFAULT_PREFERENCES: GravitasPreferences = {
  onOpen: 'resume',
  lastWorkshopPath: null,
  lastNotePath: null,
  knownWorkshops: [],
  soundEnabled: true,
  pasteIntentEnabled: true,
  seenScratchToast: false,
}

async function getStore() {
  return await load('preferences.json', {
    defaults: DEFAULT_PREFERENCES as unknown as { [key: string]: unknown },
  })
}

export async function getPreferences(): Promise<GravitasPreferences> {
  const store = await getStore()

  return {
    onOpen: await store.get<GravitasPreferences['onOpen']>('onOpen') ?? DEFAULT_PREFERENCES.onOpen,
    lastWorkshopPath: await store.get<string>('lastWorkshopPath') ?? null,
    lastNotePath: await store.get<string>('lastNotePath') ?? null,
    knownWorkshops: await store.get<string[]>('knownWorkshops') ?? [],
    soundEnabled: await store.get<boolean>('soundEnabled') ?? true,
    pasteIntentEnabled: await store.get<boolean>('pasteIntentEnabled') ?? true,
    seenScratchToast: await store.get<boolean>('seenScratchToast') ?? false,
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

export async function addKnownWorkshop(path: string): Promise<void> {
  const store = await getStore()
  const known = await store.get<string[]>('knownWorkshops') ?? []
  if (!known.includes(path)) {
    await store.set('knownWorkshops', [...known, path])
    await store.save()
  }
}