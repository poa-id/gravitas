export async function invoke(command: string): Promise<unknown> {
  if (command === 'trash_file') {
    throw new Error('Delete is disabled in the web preview because browsers cannot move files to the OS trash safely.')
  }
  throw new Error(`Tauri command "${command}" is unavailable in the web preview.`)
}
