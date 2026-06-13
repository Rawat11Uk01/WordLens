import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DictionaryError, lookupWord, normalizeWord } from '@/lib/dictionary'
import { explainInContext, OllamaError } from '@/lib/ollama'
import { addHistory, isWordSaved, removeWord, saveWord, getSavedWords } from '@/lib/storage'
import type { DictionaryEntry, Settings } from '@/lib/types'
import {
  CloseIcon,
  SparkleIcon,
  SpeakerIcon,
  StarFilledIcon,
  StarIcon
} from '@/components/Icons'

export interface PopupAnchor {
  /** Selection text. */
  word: string
  /** Surrounding context for AI explanation. */
  context: string
  /** Anchor rect in viewport coordinates. */
  rect: DOMRect | null
}

interface Props {
  anchor: PopupAnchor
  settings: Settings
  onClose: () => void
}

const POPUP_WIDTH = 360

export default function DictionaryPopup({ anchor, settings, onClose }: Props) {
  const word = useMemo(() => normalizeWord(anchor.word), [anchor.word])
  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null)
  const [saved, setSaved] = useState(false)

  const [explaining, setExplaining] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [explainError, setExplainError] = useState<string | null>(null)

  const popupRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /* ----------------------------- Dictionary fetch ----------------------------- */
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setEntry(null)
    setExplanation('')
    setExplainError(null)

    lookupWord(word, controller.signal)
      .then((result) => {
        setEntry(result)
        void addHistory(result.word)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (err instanceof DictionaryError) {
          setError({ message: err.message, notFound: err.notFound })
        } else {
          setError({ message: 'Something went wrong looking up this word.', notFound: false })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [word])

  useEffect(() => {
    isWordSaved(word).then(setSaved)
  }, [word])

  /* ------------------------------ Close behavior ------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    // Use mousedown so a new text selection elsewhere dismisses the popup first.
    document.addEventListener('mousedown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [onClose])

  /* ------------------------------- Positioning -------------------------------- */
  const position = useMemo(() => {
    const margin = 12
    const rect = anchor.rect
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!rect) {
      return { left: vw / 2 - POPUP_WIDTH / 2, top: 80 }
    }
    let left = rect.left + rect.width / 2 - POPUP_WIDTH / 2
    left = Math.max(margin, Math.min(left, vw - POPUP_WIDTH - margin))
    // Prefer below the selection; flip above if not enough room.
    const below = rect.bottom + margin
    const preferBelow = below + 260 < vh || rect.top < vh / 2
    const top = preferBelow ? below : Math.max(margin, rect.top - margin - 260)
    return { left, top }
  }, [anchor.rect])

  /* ------------------------------ Pronunciation ------------------------------- */
  const playPronunciation = useCallback(() => {
    if (entry?.audioUrl) {
      try {
        audioRef.current?.pause()
        const audio = new Audio(entry.audioUrl)
        audioRef.current = audio
        void audio.play()
        return
      } catch {
        /* fall through to speech synthesis */
      }
    }
    // Fallback: browser speech synthesis (fully offline).
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(entry?.word ?? word)
      utter.lang = 'en-US'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    }
  }, [entry, word])

  /* -------------------------------- Save word --------------------------------- */
  const toggleSave = useCallback(async () => {
    if (saved) {
      const list = await getSavedWords()
      const match = list.find((w) => w.word.toLowerCase() === (entry?.word ?? word).toLowerCase())
      if (match) await removeWord(match.id)
      setSaved(false)
      return
    }
    const primary = entry?.meanings[0]
    await saveWord({
      word: entry?.word ?? word,
      phonetic: entry?.phonetic,
      partOfSpeech: primary?.partOfSpeech,
      definition: primary?.definition,
      example: primary?.example,
      synonyms: entry?.synonyms ?? [],
      context: anchor.context
    })
    setSaved(true)
  }, [saved, entry, word, anchor.context])

  /* ----------------------------- Explain in context --------------------------- */
  const handleExplain = useCallback(async () => {
    setExplaining(true)
    setExplanation('')
    setExplainError(null)
    const controller = new AbortController()
    try {
      await explainInContext({
        baseUrl: settings.ollamaUrl,
        model: settings.ollamaModel,
        word: entry?.word ?? word,
        context: anchor.context,
        signal: controller.signal,
        onToken: (chunk) => setExplanation((prev) => prev + chunk)
      })
    } catch (err) {
      if (err instanceof OllamaError) {
        setExplainError(err.message)
      } else if ((err as Error).name !== 'AbortError') {
        setExplainError('Failed to generate explanation.')
      }
    } finally {
      setExplaining(false)
    }
  }, [settings, entry, word, anchor.context])

  return (
    <>
      <div
        ref={popupRef}
        className="dict-popup"
        style={{ left: position.left, top: position.top, width: POPUP_WIDTH }}
        role="dialog"
        aria-label={`Definition of ${word}`}
      >
        <header className="dict-popup__header">
          <div className="dict-popup__title">
            <h2>{entry?.word ?? word}</h2>
            {entry?.phonetic && <span className="dict-popup__phonetic">{entry.phonetic}</span>}
          </div>
          <div className="dict-popup__header-actions">
            <button
              className="btn btn-icon btn-ghost"
              title="Play pronunciation"
              onClick={playPronunciation}
              disabled={loading || !!error}
            >
              <SpeakerIcon />
            </button>
            <button
              className="btn btn-icon btn-ghost"
              title={saved ? 'Remove from vocabulary' : 'Save to vocabulary'}
              onClick={toggleSave}
              disabled={loading || !!error}
            >
              {saved ? <StarFilledIcon /> : <StarIcon />}
            </button>
            <button className="btn btn-icon btn-ghost" title="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="dict-popup__body">
          {loading && (
            <div className="dict-popup__loading">
              <span className="spinner" /> Looking up “{word}”…
            </div>
          )}

          {error && (
            <div className={`dict-popup__error ${error.notFound ? 'is-notfound' : ''}`}>
              {error.message}
            </div>
          )}

          {entry && !loading && (
            <>
              {entry.meanings.slice(0, 4).map((m, i) => (
                <div className="meaning" key={i}>
                  <span className="meaning__pos">{m.partOfSpeech}</span>
                  <p className="meaning__def">{m.definition}</p>
                  {m.example && <p className="meaning__example">“{m.example}”</p>}
                </div>
              ))}

              {entry.synonyms.length > 0 && (
                <div className="synonyms">
                  <span className="synonyms__label">Synonyms</span>
                  <div className="synonyms__chips">
                    {entry.synonyms.slice(0, 8).map((s) => (
                      <span className="chip" key={s}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Explain in context */}
          {!loading && !error && (
            <div className="explain">
              <button
                className="btn btn-primary explain__btn"
                onClick={handleExplain}
                disabled={explaining}
              >
                <SparkleIcon width={16} height={16} />
                {explaining ? 'Thinking…' : 'Explain in Context'}
              </button>

              {explanation && (
                <div className="explain__result">
                  {explanation}
                  {explaining && <span className="cursor-blink">▋</span>}
                </div>
              )}

              {explainError && (
                <div className="explain__error">
                  <strong>Local AI unavailable.</strong>
                  <span>{explainError}</span>
                  <span className="explain__hint">
                    Install Ollama (ollama.com), run <code>ollama serve</code>, then{' '}
                    <code>ollama pull {settings.ollamaModel}</code>.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
