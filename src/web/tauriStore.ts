const stores = new Map<string, Map<string, unknown>>()

export async function load(name: string, options?: { defaults?: Record<string, unknown> }) {
  let store = stores.get(name)
  if (!store) {
    store = new Map(Object.entries(options?.defaults ?? {}))
    stores.set(name, store)
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store!.get(key) as T | undefined
    },
    async set(key: string, value: unknown): Promise<void> {
      store!.set(key, value)
    },
    async save(): Promise<void> {},
  }
}
