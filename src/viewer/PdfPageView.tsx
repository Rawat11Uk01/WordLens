import { useEffect, useRef, useState } from 'react'
import { pdfjsLib, type PdfDocument } from '@/lib/pdf'
// Official PDF.js styles for the text/annotation layers (enables text selection).
import 'pdfjs-dist/web/pdf_viewer.css'

interface Props {
  doc: PdfDocument
  pageNumber: number
  scale: number
  /** Registers the page container so the parent can scroll to it. */
  registerRef?: (pageNumber: number, el: HTMLDivElement | null) => void
}

/**
 * Renders a single PDF page (canvas + selectable text layer). Rendering is
 * deferred until the page scrolls near the viewport so large PDFs stay smooth.
 */
export default function PdfPageView({ doc, pageNumber, scale, registerRef }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)
  const [rendered, setRendered] = useState(false)

  // Establish placeholder dimensions early (cheap) for correct scroll height.
  useEffect(() => {
    let cancelled = false
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      setDimensions({ w: viewport.width, h: viewport.height })
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber, scale])

  // Lazy-render via IntersectionObserver.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setVisible(true)
        }
      },
      { root: null, rootMargin: '800px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Actual page render once visible (or when scale changes while visible).
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy['render']> | null = null

    const render = async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const textLayerDiv = textLayerRef.current
      if (!canvas || !textLayerDiv) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
      })

      try {
        await renderTask.promise
      } catch (err) {
        if ((err as Error)?.name === 'RenderingCancelledException') return
        throw err
      }
      if (cancelled) return

      // Build the selectable text layer.
      textLayerDiv.replaceChildren()
      textLayerDiv.style.setProperty('--scale-factor', String(scale))
      textLayerDiv.style.width = `${Math.floor(viewport.width)}px`
      textLayerDiv.style.height = `${Math.floor(viewport.height)}px`

      const textContent = await page.getTextContent()
      if (cancelled) return
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      })
      await textLayer.render()
      if (!cancelled) setRendered(true)
    }

    render().catch((err) => console.error(`Failed to render page ${pageNumber}:`, err))

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [visible, doc, pageNumber, scale])

  return (
    <div
      ref={(el) => {
        containerRef.current = el
        registerRef?.(pageNumber, el)
      }}
      className="pdf-page"
      data-page-number={pageNumber}
      style={{
        width: dimensions ? `${dimensions.w}px` : undefined,
        height: dimensions ? `${dimensions.h}px` : undefined
      }}
    >
      <canvas ref={canvasRef} className="pdf-page__canvas" />
      <div ref={textLayerRef} className="textLayer" />
      {!rendered && (
        <div className="pdf-page__placeholder">
          <span className="spinner" /> Page {pageNumber}
        </div>
      )}
    </div>
  )
}
