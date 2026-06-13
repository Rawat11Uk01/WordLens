import { useEffect, useMemo, useState } from 'react'
import {
  clearHistory,
  getHistory,
  getSavedWords,
  removeWord,
  updateWordNote,
  wordsToCsv
} from '@/lib/storage'
import { listModels, OllamaError } from '@/lib/ollama'
import { useSettings } from '@/lib/useSettings'
import type { HistoryEntry, SavedWord, ThemeMode } from '@/lib/types'
import {
  BookIcon,
  ClockIcon,
  DownloadIcon,
  MoonIcon,
  SearchIcon,
  SparkleIcon,
  SpeakerIcon,
  SunIcon,
  TrashIcon
} from '@/components/Icons'
import './vocabulary.css'

type Tab = 'saved' | 'history' | 'settings'

export default function Vocabulary() {
  const { settings, update, loaded } = useSettings()
  const [tab, setTab] = useState<Tab>('saved')
  const [words, setWords] = useState<SavedWord[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void getSavedWords().then(setWords)
    void getHistory().then(setHistory)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return words
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(q) ||
        w.definition?.toLowerCase().includes(q) ||
        w.synonyms.some((s) => s.toLowerCase().includes(q)) ||
        w.note?.toLowerCase().includes(q)
    )
  }, [words, query])

  const handleRemove = async (id: string) => {
    setWords(await removeWord(id))
  }

  const handleNote = async (id: string, note: string) => {
    setWords(await updateWordNote(id, note))
  }

  const exportCsv = () => {
    const csv = wordsToCsv(words)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vocabulary-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const speak = (word: string) => {
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(word)
      utter.lang = 'en-US'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    }
  }

  const isDark = document.documentElement.dataset.theme === 'dark'
  const toggleTheme = () => {
    void update({ theme: isDark ? 'light' : 'dark' })
  }

  if (!loaded) return null

  return (
    <div className="vocab">
      <aside className="vocab__sidebar">
        <div className="vocab__logo">
          <BookIcon />
          <div>
            <strong>PDF Smart Dictionary</strong>
            <span>My Vocabulary</span>
          </div>
        </div>

        <nav className="vocab__nav">
          <button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>
            <BookIcon width={16} height={16} /> Saved Words
            <span className="vocab__count">{words.length}</span>
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            <ClockIcon width={16} height={16} /> Recent Lookups
            <span className="vocab__count">{history.length}</span>
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            <SparkleIcon width={16} height={16} /> Settings
          </button>
        </nav>

        <div className="vocab__sidebar-footer">
          <button className="btn btn-icon" onClick={toggleTheme} title="Toggle theme">
            {isDark ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
          </button>
        </div>
      </aside>

      <main className="vocab__main">
        {tab === 'saved' && (
          <>
            <div className="vocab__toolbar">
              <div className="vocab__search">
                <SearchIcon width={16} height={16} />
                <input
                  placeholder="Search saved words, definitions, synonyms…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button className="btn" onClick={exportCsv} disabled={words.length === 0}>
                <DownloadIcon width={16} height={16} /> Export CSV
              </button>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title={words.length === 0 ? 'No saved words yet' : 'No matches'}
                subtitle={
                  words.length === 0
                    ? 'Open a PDF and tap the star on any word to save it here.'
                    : 'Try a different search.'
                }
              />
            ) : (
              <div className="word-grid">
                {filtered.map((w) => (
                  <WordCard
                    key={w.id}
                    word={w}
                    onRemove={() => handleRemove(w.id)}
                    onSpeak={() => speak(w.word)}
                    onNote={(note) => handleNote(w.id, note)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            <div className="vocab__toolbar">
              <h2 className="vocab__heading">Recent Lookups</h2>
              <button
                className="btn"
                onClick={async () => {
                  await clearHistory()
                  setHistory([])
                }}
                disabled={history.length === 0}
              >
                <TrashIcon width={16} height={16} /> Clear history
              </button>
            </div>
            {history.length === 0 ? (
              <EmptyState title="No lookups yet" subtitle="Words you look up will appear here." />
            ) : (
              <ul className="history-list">
                {history.map((h, i) => (
                  <li key={`${h.word}-${i}`}>
                    <span className="history-list__word">{h.word}</span>
                    <span className="history-list__time">
                      {new Date(h.lookedUpAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'settings' && (
          <SettingsPanel
            theme={settings.theme}
            ollamaUrl={settings.ollamaUrl}
            ollamaModel={settings.ollamaModel}
            onChange={update}
          />
        )}
      </main>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function WordCard({
  word,
  onRemove,
  onSpeak,
  onNote
}: {
  word: SavedWord
  onRemove: () => void
  onSpeak: () => void
  onNote: (note: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(word.note ?? '')

  return (
    <article className="word-card">
      <header className="word-card__header">
        <div>
          <h3>{word.word}</h3>
          {word.phonetic && <span className="word-card__phonetic">{word.phonetic}</span>}
        </div>
        <div className="word-card__actions">
          <button className="btn btn-icon btn-ghost" onClick={onSpeak} title="Pronounce">
            <SpeakerIcon width={16} height={16} />
          </button>
          <button className="btn btn-icon btn-ghost" onClick={onRemove} title="Delete">
            <TrashIcon width={16} height={16} />
          </button>
        </div>
      </header>

      {word.partOfSpeech && <span className="word-card__pos">{word.partOfSpeech}</span>}
      {word.definition && <p className="word-card__def">{word.definition}</p>}
      {word.example && <p className="word-card__example">“{word.example}”</p>}

      {word.synonyms.length > 0 && (
        <div className="word-card__synonyms">
          {word.synonyms.slice(0, 6).map((s) => (
            <span className="chip" key={s}>
              {s}
            </span>
          ))}
        </div>
      )}

      {editing ? (
        <div className="word-card__note-edit">
          <textarea
            value={note}
            placeholder="Add a personal note…"
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className="word-card__note-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                onNote(note)
                setEditing(false)
              }}
            >
              Save note
            </button>
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="word-card__note" onClick={() => setEditing(true)}>
          {word.note ? `📝 ${word.note}` : '+ Add note'}
        </button>
      )}

      <footer className="word-card__footer">
        Saved {new Date(word.dateAdded).toLocaleDateString()}
      </footer>
    </article>
  )
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="empty-state">
      <BookIcon width={40} height={40} />
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  )
}

function SettingsPanel({
  theme,
  ollamaUrl,
  ollamaModel,
  onChange
}: {
  theme: ThemeMode
  ollamaUrl: string
  ollamaModel: string
  onChange: (patch: Partial<{ theme: ThemeMode; ollamaUrl: string; ollamaModel: string }>) => void
}) {
  const [status, setStatus] = useState<
    { kind: 'idle' | 'checking' | 'ok' | 'error'; message?: string; models?: string[] }
  >({ kind: 'idle' })

  const testOllama = async () => {
    setStatus({ kind: 'checking' })
    try {
      const models = await listModels(ollamaUrl)
      setStatus({
        kind: 'ok',
        message:
          models.length > 0
            ? `Connected! ${models.length} model(s) installed.`
            : 'Connected, but no models installed yet. Run "ollama pull llama3".',
        models
      })
    } catch (err) {
      const message = err instanceof OllamaError ? err.message : 'Could not connect to Ollama.'
      setStatus({ kind: 'error', message })
    }
  }

  return (
    <div className="settings">
      <h2 className="vocab__heading">Settings</h2>

      <section className="settings__group">
        <h3>Appearance</h3>
        <label className="settings__row">
          <span>Theme</span>
          <select value={theme} onChange={(e) => onChange({ theme: e.target.value as ThemeMode })}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>

      <section className="settings__group">
        <h3>Local AI (Ollama)</h3>
        <p className="settings__desc">
          “Explain in Context” uses a local LLM via Ollama — fully offline, no cloud, no API keys.
          Install from <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a>,
          then run <code>ollama serve</code> and pull a model.
        </p>
        <label className="settings__row">
          <span>Ollama URL</span>
          <input
            value={ollamaUrl}
            onChange={(e) => onChange({ ollamaUrl: e.target.value })}
            placeholder="http://localhost:11434"
          />
        </label>
        <label className="settings__row">
          <span>Model</span>
          <input
            value={ollamaModel}
            onChange={(e) => onChange({ ollamaModel: e.target.value })}
            placeholder="llama3"
            list="model-suggestions"
          />
          <datalist id="model-suggestions">
            <option value="llama3" />
            <option value="llama3.1" />
            <option value="qwen2.5" />
            <option value="mistral" />
            <option value="phi3" />
          </datalist>
        </label>
        <div className="settings__row">
          <span />
          <button className="btn btn-primary" onClick={testOllama} disabled={status.kind === 'checking'}>
            {status.kind === 'checking' ? 'Checking…' : 'Test connection'}
          </button>
        </div>
        {status.message && (
          <div className={`settings__status settings__status--${status.kind}`}>
            {status.message}
            {status.models && status.models.length > 0 && (
              <div className="settings__models">
                {status.models.map((m) => (
                  <button key={m} className="chip chip--button" onClick={() => onChange({ ollamaModel: m })}>
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
