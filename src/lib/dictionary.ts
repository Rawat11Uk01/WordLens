import type { DictionaryEntry, WordDefinition } from './types'

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'

/** Shape returned by api.dictionaryapi.dev (only the fields we use). */
interface ApiPhonetic {
  text?: string
  audio?: string
}
interface ApiDefinition {
  definition: string
  example?: string
  synonyms?: string[]
  antonyms?: string[]
}
interface ApiMeaning {
  partOfSpeech: string
  definitions: ApiDefinition[]
  synonyms?: string[]
  antonyms?: string[]
}
interface ApiEntry {
  word: string
  phonetic?: string
  phonetics?: ApiPhonetic[]
  meanings?: ApiMeaning[]
}

export class DictionaryError extends Error {
  readonly notFound: boolean
  constructor(message: string, notFound = false) {
    super(message)
    this.name = 'DictionaryError'
    this.notFound = notFound
  }
}

/**
 * Sanitize a raw selection into a single lookup-able word.
 * Strips punctuation, takes the first token, lowercases.
 */
export function normalizeWord(raw: string): string {
  return raw
    .trim()
    .replace(/[^\p{L}\p{M}'’-]/gu, ' ')
    .trim()
    .split(/\s+/)[0]
    ?.replace(/^['’-]+|['’-]+$/g, '')
    .toLowerCase() ?? ''
}

function pickAudio(phonetics: ApiPhonetic[] | undefined): string | undefined {
  if (!phonetics) return undefined
  const withAudio = phonetics.find((p) => p.audio && p.audio.trim().length > 0)
  return withAudio?.audio
}

function pickPhonetic(entry: ApiEntry): string | undefined {
  if (entry.phonetic) return entry.phonetic
  return entry.phonetics?.find((p) => p.text)?.text
}

export async function lookupWord(rawWord: string, signal?: AbortSignal): Promise<DictionaryEntry> {
  const word = normalizeWord(rawWord)
  if (!word) {
    throw new DictionaryError('No valid word selected.', true)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}/${encodeURIComponent(word)}`, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new DictionaryError(
      'Network error. Check your internet connection (dictionary lookups need internet).'
    )
  }

  if (response.status === 404) {
    throw new DictionaryError(`No definition found for “${word}”.`, true)
  }
  if (!response.ok) {
    throw new DictionaryError(`Dictionary service error (${response.status}).`)
  }

  const data = (await response.json()) as ApiEntry[]
  if (!Array.isArray(data) || data.length === 0) {
    throw new DictionaryError(`No definition found for “${word}”.`, true)
  }

  const meanings: WordDefinition[] = []
  const synonymSet = new Set<string>()
  let phonetic: string | undefined
  let audioUrl: string | undefined

  for (const entry of data) {
    phonetic ??= pickPhonetic(entry)
    audioUrl ??= pickAudio(entry.phonetics)

    for (const meaning of entry.meanings ?? []) {
      for (const syn of meaning.synonyms ?? []) synonymSet.add(syn)
      for (const def of meaning.definitions ?? []) {
        const defSyns = def.synonyms ?? []
        for (const syn of defSyns) synonymSet.add(syn)
        meanings.push({
          partOfSpeech: meaning.partOfSpeech,
          definition: def.definition,
          example: def.example,
          synonyms: defSyns,
          antonyms: def.antonyms ?? []
        })
      }
    }
  }

  if (meanings.length === 0) {
    throw new DictionaryError(`No definition found for “${word}”.`, true)
  }

  return {
    word: data[0].word || word,
    phonetic,
    audioUrl,
    meanings,
    synonyms: Array.from(synonymSet).slice(0, 30),
    source: 'dictionaryapi.dev'
  }
}
