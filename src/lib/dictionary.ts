import { getCachedEntry, setCachedEntry } from './storage'
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

/**
 * Generate candidate base forms (lemmas) for an inflected word, ordered most-
 * likely first. Used as a fallback when an exact lookup 404s, so plurals, verb
 * tenses, comparatives, and adverbs resolve to their dictionary entry.
 *
 * This is a lightweight rule-based heuristic — not a full morphological
 * analyzer — but it covers the overwhelming majority of everyday inflections.
 */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase()
  const out: string[] = []
  const add = (candidate: string | undefined) => {
    if (candidate && candidate.length >= 2 && candidate !== w && !out.includes(candidate)) {
      out.push(candidate)
    }
  }
  const endsDoubled = (s: string) => s.length >= 2 && s[s.length - 1] === s[s.length - 2]

  // Plurals: studies -> study, boxes -> box, cats -> cat.
  if (w.endsWith('ies') && w.length > 4) add(w.slice(0, -3) + 'y')
  if (w.endsWith('es') && w.length > 3) {
    add(w.slice(0, -2))
    add(w.slice(0, -1))
  }
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) add(w.slice(0, -1))

  // Past tense: carried -> carry, used -> use, stopped -> stop, walked -> walk.
  if (w.endsWith('ied') && w.length > 4) add(w.slice(0, -3) + 'y')
  if (w.endsWith('ed') && w.length > 3) {
    add(w.slice(0, -1))
    add(w.slice(0, -2))
    const stem = w.slice(0, -2)
    if (endsDoubled(stem)) add(stem.slice(0, -1))
  }

  // Present participle: making -> make, running -> run, reading -> read.
  if (w.endsWith('ing') && w.length > 4) {
    const stem = w.slice(0, -3)
    if (endsDoubled(stem)) add(stem.slice(0, -1))
    add(stem)
    add(stem + 'e')
  }

  // Comparatives/superlatives: bigger -> big, larger -> large, happiest -> happy.
  if (w.endsWith('ier') && w.length > 4) add(w.slice(0, -3) + 'y')
  if (w.endsWith('er') && w.length > 3) {
    add(w.slice(0, -2))
    add(w.slice(0, -1))
    const stem = w.slice(0, -2)
    if (endsDoubled(stem)) add(stem.slice(0, -1))
  }
  if (w.endsWith('iest') && w.length > 5) add(w.slice(0, -4) + 'y')
  if (w.endsWith('est') && w.length > 4) {
    add(w.slice(0, -3))
    add(w.slice(0, -2))
    const stem = w.slice(0, -3)
    if (endsDoubled(stem)) add(stem.slice(0, -1))
  }

  // Adverbs: quickly -> quick.
  if (w.endsWith('ly') && w.length > 3) add(w.slice(0, -2))

  return out.slice(0, 6)
}

/** Common parts of speech, ordered by how "everyday" they tend to be. */
const POS_PRIORITY: Record<string, number> = {
  noun: 0,
  verb: 1,
  adjective: 2,
  adverb: 3
}

/**
 * Pick the easiest-to-understand definition to show as the headline meaning.
 *
 * dictionaryapi.dev does not order senses by simplicity, so the first one can
 * be a technical/archaic sense. We favour short, plain definitions from common
 * parts of speech and penalise hallmarks of complexity (semicolons, parentheses,
 * lexicographer jargon like "denoting"/"relating to").
 */
export function pickSimpleDefinition(meanings: WordDefinition[]): string | undefined {
  const wordCount = (s: string) => s.trim().split(/\s+/).length

  const complexity = (m: WordDefinition): number => {
    const def = m.definition.trim()
    let score = wordCount(def)
    if (/[;:(]/.test(def)) score += 6
    if (/\b(esp\.|e\.g\.|i\.e\.|typically|denoting|relating to|chiefly|archaic|formal)\b/i.test(def))
      score += 4
    score += POS_PRIORITY[m.partOfSpeech?.toLowerCase()] ?? 5
    return score
  }

  const usable = meanings.filter((m) => {
    const wc = wordCount(m.definition)
    return wc >= 3 && wc <= 24
  })
  const pool = usable.length > 0 ? usable : meanings
  if (pool.length === 0) return undefined

  return pool.reduce((best, m) => (complexity(m) < complexity(best) ? m : best)).definition
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

/** Fetch + normalize a single exact word from the API (no cache, no lemmas). */
async function fetchEntry(word: string, signal?: AbortSignal): Promise<DictionaryEntry> {
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

/**
 * Look up a word with three layers of resilience:
 *  1. Local cache  — instant repeats, works offline for previously-seen words.
 *  2. Exact fetch  — the normal dictionaryapi.dev call.
 *  3. Lemma fallback — if the exact form 404s, retry base forms (plurals,
 *     tenses, comparatives, adverbs) so inflected words still resolve.
 * Successful results are cached under both the queried form and the resolved
 * form, so future lookups of either are instant.
 */
export async function lookupWord(rawWord: string, signal?: AbortSignal): Promise<DictionaryEntry> {
  const word = normalizeWord(rawWord)
  if (!word) {
    throw new DictionaryError('No valid word selected.', true)
  }

  const cached = await getCachedEntry(word)
  if (cached) return cached

  const cache = (key: string, entry: DictionaryEntry) => {
    void setCachedEntry(key, entry)
  }

  // 1) Exact form.
  try {
    const entry = await fetchEntry(word, signal)
    cache(word, entry)
    if (entry.word.toLowerCase() !== word) cache(entry.word.toLowerCase(), entry)
    return entry
  } catch (err) {
    if (err instanceof DictionaryError && !err.notFound) throw err
    if ((err as Error).name === 'AbortError') throw err
    // Otherwise fall through to lemma candidates.
  }

  // 2) Lemma fallbacks.
  for (const candidate of lemmaCandidates(word)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const hit = await getCachedEntry(candidate)
    if (hit) {
      cache(word, hit)
      return hit
    }
    try {
      const entry = await fetchEntry(candidate, signal)
      cache(candidate, entry)
      cache(word, entry)
      return entry
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      // Try the next candidate.
    }
  }

  throw new DictionaryError(`No definition found for “${word}”.`, true)
}
