import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPdfFromData, type PdfDocument } from '@/lib/pdf'
import { getSelectionInfo } from '@/lib/selection'
import { useSettings } from '@/lib/useSettings'
import type { RuntimeMessage } from '@/lib/types'
import PdfPageView from './PdfPageView'
import DictionaryPopup, { type PopupAnchor } from './DictionaryPopup'
import {
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  UploadIcon
} from '@/components/Icons'
import './viewer.css'
import './popup.css'

const MAX_SELECTION_LENGTH = 60

export default function Viewer() {
  const { settings, update, loaded } = useSettings()
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.3)
  const [anchor, setAnchor] = useState<PopupAnchor | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ------------------------------- Load PDF -------------------------------- */
  const openFile = useCallback(async (file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const pdf = await loadPdfFromData(buffer)
      setDoc(pdf)
      setNumPages(pdf.numPages)
      setFileName(file.name)
      setCurrentPage(1)
      pageRefs.current.clear()
    } catch (err) {
      console.error(err)
      setError('Could not open this PDF. It may be corrupted or password-protected.')
    }
  }, [])

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void openFile(file)
  }

  /* ------------------------------ Drag & drop ------------------------------ */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void openFile(file)
    },
    [openFile]
  )

  /* --------------------------- Selection -> popup -------------------------- */
  const triggerLookupFromSelection = useCallback(() => {
    const info = getSelectionInfo()
    if (!info || !info.text) return false
    if (info.text.length > MAX_SELECTION_LENGTH) return false
    setAnchor({ word: info.text, context: info.context, rect: info.rect })
    return true
  }, [])

  const onMouseUp = useCallback(() => {
    // Small delay lets the browser finalize the selection (esp. double-click).
    window.setTimeout(() => triggerLookupFromSelection(), 0)
  }, [triggerLookupFromSelection])

  /* ------------------- Deep link: ?lookup=word (from context menu) -------- */
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('lookup')
    if (param) {
      setAnchor({ word: param, context: param, rect: null })
    }
  }, [])

  /* ------------------- Runtime messages (context menu / keys) ------------- */
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return
    const handler = (msg: RuntimeMessage) => {
      if (msg.type === 'LOOKUP_TEXT' && msg.text) {
        setAnchor({ word: msg.text, context: msg.text, rect: null })
      } else if (msg.type === 'LOOKUP_SELECTION') {
        if (!triggerLookupFromSelection()) {
          setToast('Select a word in the PDF first.')
          window.setTimeout(() => setToast(null), 2200)
        }
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [triggerLookupFromSelection])

  /* ----------------------------- Track page -------------------------------- */
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !doc) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) {
          const pageNum = Number((visible.target as HTMLElement).dataset.pageNumber)
          if (pageNum) setCurrentPage(pageNum)
        }
      },
      { root, threshold: [0.1, 0.5, 0.9] }
    )
    pageRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [doc, numPages])

  const registerPageRef = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNumber, el)
    else pageRefs.current.delete(pageNumber)
  }, [])

  const goToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /* ------------------------------- Keyboard -------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        fileInputRef.current?.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openVocabulary = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage()
    } else {
      window.open('/src/vocabulary/index.html', '_blank')
    }
  }, [])

  const toggleTheme = useCallback(() => {
    const resolved =
      settings.theme === 'dark'
        ? 'light'
        : settings.theme === 'light'
          ? 'dark'
          : document.documentElement.dataset.theme === 'dark'
            ? 'light'
            : 'dark'
    void update({ theme: resolved })
  }, [settings.theme, update])

  const isDark = document.documentElement.dataset.theme === 'dark'

  if (!loaded) return null

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar__brand">
          <BookIcon />
          PDF Smart Dictionary
        </div>

        <button className="btn" onClick={() => fileInputRef.current?.click()} title="Open PDF (Ctrl+O)">
          <UploadIcon width={16} height={16} />
          Open PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={onFileInput}
        />

        {doc && (
          <div className="toolbar__group">
            <button
              className="btn btn-icon"
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              title="Previous page"
            >
              <ChevronLeftIcon width={16} height={16} />
            </button>
            <span className="toolbar__pageinfo">
              {currentPage} / {numPages}
            </span>
            <button
              className="btn btn-icon"
              onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              title="Next page"
            >
              <ChevronRightIcon width={16} height={16} />
            </button>
          </div>
        )}

        {fileName && <span className="toolbar__pageinfo" style={{ minWidth: 0 }}>{fileName}</span>}

        <div className="toolbar__spacer" />

        {doc && (
          <div className="toolbar__group">
            <button
              className="btn btn-icon"
              onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}
              title="Zoom out"
            >
              <MinusIcon width={16} height={16} />
            </button>
            <span className="toolbar__zoom">{Math.round(scale * 100)}%</span>
            <button
              className="btn btn-icon"
              onClick={() => setScale((s) => Math.min(3, +(s + 0.15).toFixed(2)))}
              title="Zoom in"
            >
              <PlusIcon width={16} height={16} />
            </button>
          </div>
        )}

        <button className="btn btn-icon" onClick={toggleTheme} title="Toggle theme">
          {isDark ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
        </button>
        <button className="btn" onClick={openVocabulary} title="My vocabulary">
          <BookIcon width={16} height={16} />
          Vocabulary
        </button>
      </header>

      {!doc ? (
        <div
          className={`dropzone ${dragOver ? 'is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="dropzone__inner">
            <UploadIcon width={40} height={40} />
            <h1>Open a PDF to get started</h1>
            <p>Drag &amp; drop a PDF here, or click “Open PDF”.</p>
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
              <UploadIcon width={16} height={16} />
              Choose a PDF
            </button>
            {error && <p style={{ color: 'var(--danger)', marginTop: 16 }}>{error}</p>}
            <p className="dropzone__hint">
              Tip: double-click or highlight any word to look it up. Press{' '}
              <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> to look up your selection.
            </p>
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="pdf-scroll" onMouseUp={onMouseUp}>
          {Array.from({ length: numPages }, (_, i) => (
            <PdfPageView
              key={`${fileName}-${i + 1}`}
              doc={doc}
              pageNumber={i + 1}
              scale={scale}
              registerRef={registerPageRef}
            />
          ))}
        </div>
      )}

      {anchor && (
        <DictionaryPopup anchor={anchor} settings={settings} onClose={() => setAnchor(null)} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
