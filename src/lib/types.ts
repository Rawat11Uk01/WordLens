/** A single sense/definition of a word. */
export interface WordDefinition {
  partOfSpeech: string
  definition: string
  example?: string
  synonyms: string[]
  antonyms: string[]
}

/** Normalized result of a dictionary lookup. */
export interface DictionaryEntry {
  word: string
  phonetic?: string
  /** URL to an audio pronunciation file, if available. */
  audioUrl?: string
  meanings: WordDefinition[]
  /** Aggregated, de-duplicated synonyms across all senses. */
  synonyms: string[]
  /** Where the data came from. */
  source: 'dictionaryapi.dev'
}

/** A word the user has chosen to save into their vocabulary. */
export interface SavedWord {
  id: string
  word: string
  phonetic?: string
  partOfSpeech?: string
  definition?: string
  example?: string
  synonyms: string[]
  /** Optional sentence/paragraph the word was found in. */
  context?: string
  /** Optional user note. */
  note?: string
  /** ISO timestamp. */
  dateAdded: string
}

/** A recent lookup entry for the history list. */
export interface HistoryEntry {
  word: string
  /** ISO timestamp. */
  lookedUpAt: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface Settings {
  theme: ThemeMode
  ollamaUrl: string
  ollamaModel: string
  /** Cap on how many history entries to keep. */
  historyLimit: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  historyLimit: 100
}

/** Messages passed between the service worker and extension pages. */
export type RuntimeMessage =
  | { type: 'LOOKUP_TEXT'; text: string }
  | { type: 'LOOKUP_SELECTION' }
  | { type: 'PING' }
