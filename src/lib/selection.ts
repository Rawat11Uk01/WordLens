export interface SelectionInfo {
  /** The raw selected text. */
  text: string
  /** A surrounding window of text for context-aware explanations. */
  context: string
  /** Bounding rectangle of the selection in viewport coordinates. */
  rect: DOMRect | null
}

const CONTEXT_RADIUS = 400

/**
 * Read the current text selection plus a window of surrounding text from the
 * containing PDF page, for use as LLM context.
 */
export function getSelectionInfo(): SelectionInfo | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }
  const text = selection.toString().trim()
  if (!text) return null

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  // Find the enclosing PDF page (or any element) to extract context from.
  let node: Node | null = range.commonAncestorContainer
  let pageEl: HTMLElement | null = null
  while (node) {
    if (node instanceof HTMLElement && node.classList.contains('pdf-page')) {
      pageEl = node
      break
    }
    node = node.parentNode
  }

  let context = text
  const source = pageEl ?? (range.commonAncestorContainer.parentElement as HTMLElement | null)
  if (source) {
    const fullText = source.textContent ?? ''
    const idx = fullText.indexOf(text)
    if (idx >= 0) {
      const start = Math.max(0, idx - CONTEXT_RADIUS)
      const end = Math.min(fullText.length, idx + text.length + CONTEXT_RADIUS)
      context = fullText.slice(start, end).replace(/\s+/g, ' ').trim()
    } else {
      context = fullText.slice(0, CONTEXT_RADIUS * 2).replace(/\s+/g, ' ').trim()
    }
  }

  return { text, context, rect }
}
