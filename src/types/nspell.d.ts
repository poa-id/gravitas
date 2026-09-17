declare module 'nspell' {
  export interface NSpell {
    correct(word: string): boolean
    suggest(word: string): string[]
    add(word: string, model?: string): void
    remove(word: string): void
  }

  export interface NSpellDictionary {
    aff: string | Uint8Array
    dic: string | Uint8Array
  }

  export default function nspell(dictionary: NSpellDictionary): NSpell
}
