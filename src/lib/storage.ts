import {
  DEFAULT_SETTINGS,
  type HistoryEntry,
  type SavedWord,
  type Settings
} from './types'

const KEYS = {
  saved: 'savedWords',
  history: 'history',
  settings: 'settings'
} as const

/**
 * Thin wrapper around chrome.storage.local with a localStorage fallback so the
 * UI can still be developed/previewed outside the extension context.
 */
function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    !!chrome.storage &&
    !!chrome.storage.local
  )
}

async function readRaw<T>(key: string, fallback: T): Promise<T> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key)
    return (result[key] as T) ?? fallback
  }
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

async function writeRaw<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value })
    return
  }
  localStorage.setItem(key, JSON.stringify(value))
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export async function getSettings(): Promise<Settings> {
  const stored = await readRaw<Partial<Settings>>(KEYS.settings, {})
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeRaw(KEYS.settings, settings)
}

/* -------------------------------------------------------------------------- */
/* Saved words                                                                */
/* -------------------------------------------------------------------------- */

export async function getSavedWords(): Promise<SavedWord[]> {
  return readRaw<SavedWord[]>(KEYS.saved, [])
}

export async function isWordSaved(word: string): Promise<boolean> {
  const list = await getSavedWords()
  const target = word.trim().toLowerCase()
  return list.some((w) => w.word.toLowerCase() === target)
}

export async function saveWord(entry: Omit<SavedWord, 'id' | 'dateAdded'>): Promise<SavedWord[]> {
  const list = await getSavedWords()
  const target = entry.word.trim().toLowerCase()
  // Don't duplicate; update existing instead.
  const existingIndex = list.findIndex((w) => w.word.toLowerCase() === target)
  const record: SavedWord = {
    ...entry,
    id:
      existingIndex >= 0
        ? list[existingIndex].id
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dateAdded: existingIndex >= 0 ? list[existingIndex].dateAdded : new Date().toISOString()
  }
  if (existingIndex >= 0) {
    list[existingIndex] = record
  } else {
    list.unshift(record)
  }
  await writeRaw(KEYS.saved, list)
  return list
}

export async function removeWord(id: string): Promise<SavedWord[]> {
  const list = await getSavedWords()
  const next = list.filter((w) => w.id !== id)
  await writeRaw(KEYS.saved, next)
  return next
}

export async function updateWordNote(id: string, note: string): Promise<SavedWord[]> {
  const list = await getSavedWords()
  const next = list.map((w) => (w.id === id ? { ...w, note } : w))
  await writeRaw(KEYS.saved, next)
  return next
}

/* -------------------------------------------------------------------------- */
/* History / recent lookups                                                   */
/* -------------------------------------------------------------------------- */

export async function getHistory(): Promise<HistoryEntry[]> {
  return readRaw<HistoryEntry[]>(KEYS.history, [])
}

export async function addHistory(word: string): Promise<HistoryEntry[]> {
  const settings = await getSettings()
  const list = await getHistory()
  const cleaned = word.trim()
  if (!cleaned) return list
  // Move existing to front (dedupe, case-insensitive).
  const filtered = list.filter((h) => h.word.toLowerCase() !== cleaned.toLowerCase())
  filtered.unshift({ word: cleaned, lookedUpAt: new Date().toISOString() })
  const capped = filtered.slice(0, settings.historyLimit)
  await writeRaw(KEYS.history, capped)
  return capped
}

export async function clearHistory(): Promise<void> {
  await writeRaw(KEYS.history, [])
}

/* -------------------------------------------------------------------------- */
/* CSV export                                                                 */
/* -------------------------------------------------------------------------- */

export function wordsToCsv(words: SavedWord[]): string {
  const headers = [
    'word',
    'phonetic',
    'partOfSpeech',
    'definition',
    'example',
    'synonyms',
    'context',
    'note',
    'dateAdded'
  ]
  const escape = (value: string | undefined): string => {
    const v = value ?? ''
    if (/[",\n]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`
    }
    return v
  }
  const rows = words.map((w) =>
    [
      w.word,
      w.phonetic,
      w.partOfSpeech,
      w.definition,
      w.example,
      w.synonyms.join('; '),
      w.context,
      w.note,
      w.dateAdded
    ]
      .map(escape)
      .join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}
