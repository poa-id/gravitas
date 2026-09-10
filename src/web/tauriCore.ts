import { remove } from './tauriFs'

export async function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  if (command === 'trash_file' && typeof args?.path === 'string') {
    await remove(args.path, { recursive: true })
    return null
  }
  throw new Error(`Tauri command "${command}" is unavailable in the web preview.`)
}
