import { setWebRoot, webPathForRoot } from './fsState'

export async function open(options?: { directory?: boolean; multiple?: boolean; title?: string }): Promise<string | string[] | null> {
  if (!options?.directory) throw new Error('Web preview only supports opening directories.')
  const picker = (window as any).showDirectoryPicker
  if (typeof picker !== 'function') {
    throw new Error('This browser does not support local folder access. Use Chrome or Edge.')
  }
  try {
    const handle = await picker.call(window, { mode: 'readwrite' })
    await setWebRoot(handle)
    return webPathForRoot()
  } catch (err: any) {
    if (err?.name === 'AbortError') return null
    throw err
  }
}
