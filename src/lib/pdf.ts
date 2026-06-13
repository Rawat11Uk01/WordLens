import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this to a hashed asset URL that the worker can be loaded from.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDocument = pdfjsLib.PDFDocumentProxy
export type PdfPage = pdfjsLib.PDFPageProxy

/** Load a PDF from an ArrayBuffer (e.g. an uploaded File). */
export async function loadPdfFromData(data: ArrayBuffer): Promise<PdfDocument> {
  const task = pdfjsLib.getDocument({ data })
  return task.promise
}

/** Load a PDF from a URL. */
export async function loadPdfFromUrl(url: string): Promise<PdfDocument> {
  const task = pdfjsLib.getDocument({ url })
  return task.promise
}

export { pdfjsLib }
