/**
 * Free, key-less English → Hindi translation.
 *
 * Primary source is Google's public `translate_a/single` endpoint, which gives
 * accurate single-word/phrase translations. If that's unreachable we fall back
 * to the MyMemory API — but only to its clean machine-translation match, since
 * MyMemory's default result is a community "translation memory" entry that is
 * frequently a wrong, unrelated sentence.
 *
 * Like the dictionary lookup, this needs internet. It is intentionally
 * best-effort: any failure resolves to `null` so a missing translation never
 * blocks or breaks the rest of the popup.
 */

const GOOGLE_BASE = 'https://translate.googleapis.com/translate_a/single'
const MYMEMORY_BASE = 'https://api.mymemory.translated.net/get'

/** Contains at least one Devanagari character. */
function looksLikeHindi(text: string): boolean {
  return /[\u0900-\u097F]/.test(text)
}

function isUsable(source: string, candidate: string | undefined | null): candidate is string {
  if (!candidate) return false
  const t = candidate.trim()
  if (!t) return false
  // An unchanged echo of the input means "no translation".
  if (t.toLowerCase() === source.toLowerCase()) return false
  return looksLikeHindi(t)
}

/**
 * Translate a single English word/phrase to Hindi.
 * Returns the Hindi string, or `null` when unavailable.
 */
export async function translateToHindi(
  text: string,
  signal?: AbortSignal
): Promise<string | null> {
  const q = text.trim()
  if (!q) return null

  const viaGoogle = await translateViaGoogle(q, signal)
  if (viaGoogle) return viaGoogle

  return translateViaMyMemory(q, signal)
}

/* --------------------------------- Google ---------------------------------- */

async function translateViaGoogle(q: string, signal?: AbortSignal): Promise<string | null> {
  const url = `${GOOGLE_BASE}?client=gtx&sl=en&tl=hi&dt=t&q=${encodeURIComponent(q)}`

  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return null
  }
  if (!res.ok) return null

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return null
  }

  // Response shape: [ [ ["translated","source",...], ... ], ... ]
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : []
  const translated = segments
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('')
    .trim()

  return isUsable(q, translated) ? translated : null
}

/* -------------------------------- MyMemory --------------------------------- */

interface MyMemoryMatch {
  translation?: string
  'created-by'?: string
}
interface MyMemoryResponse {
  responseData?: { translatedText?: string }
  responseStatus?: number | string
  matches?: MyMemoryMatch[]
}

async function translateViaMyMemory(q: string, signal?: AbortSignal): Promise<string | null> {
  const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(q)}&langpair=en|hi&mt=1`

  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return null
  }
  if (!res.ok) return null

  let data: MyMemoryResponse
  try {
    data = (await res.json()) as MyMemoryResponse
  } catch {
    return null
  }

  // Prefer the machine-translation match ("MT!"), which is literal and clean,
  // over the default top result (often a noisy community sentence).
  const mtMatch = data.matches?.find((m) => m['created-by'] === 'MT!')?.translation
  if (isUsable(q, mtMatch)) return mtMatch.trim()

  if (Number(data.responseStatus) === 200) {
    const fallback = data.responseData?.translatedText
    if (isUsable(q, fallback)) return fallback.trim()
  }

  return null
}
