/**
 * Plain text out of the files people upload: Word, Excel, PDF and text files.
 * Pure of Firebase so it can be tested on its own.
 */

export type FileKind = 'docx' | 'xlsx' | 'pdf' | 'text' | 'unsupported'

export interface ExtractResult {
  text: string
  kind: FileKind
  pages?: number
  /** A PDF with no text layer (a scan): nothing could be read without OCR. */
  scanned?: boolean
  /** Why nothing was read, when that is not simply an empty file. */
  note?: string
}

export interface ExtractOptions {
  /** Called for a scanned PDF; returns the transcribed text. */
  ocr?: (pdf: Uint8Array) => Promise<string>
}

export const MAX_PDF_PAGES = 400
/** A text PDF has hundreds of characters per page; a scan with a stray header or page number has a handful. */
const MIN_CHARS_PER_PAGE = 100

const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/)?.[1] ?? '')

const startsWith = (b: Uint8Array, bytes: number[]) => bytes.every((v, i) => b[i] === v)

export function detectKind(buf: Uint8Array, name: string): FileKind {
  const ext = extOf(name)
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
  const zip = startsWith(buf, [0x50, 0x4b, 0x03, 0x04])
  if (zip && ext === 'docx') return 'docx'
  if (zip && ext === 'xlsx') return 'xlsx'
  if (zip && ext === 'xlsm') return 'xlsx'
  if (['txt', 'csv', 'md', 'tsv', 'json'].includes(ext)) return 'text'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  return 'unsupported'
}

const clean = (s: string) => s.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

/** Node's Buffer, without needing Node's global types in every tsconfig that imports this file. */
const toBuffer = (b: Uint8Array) => (globalThis as unknown as { Buffer: { from(x: Uint8Array): never } }).Buffer.from(b)

/** The default export of a module that may be CommonJS or ESM once bundled. */
const interop = <T>(mod: T): T => ((mod as unknown as { default?: T }).default ?? mod) as T

async function docxText(buf: Uint8Array): Promise<string> {
  const lib = interop(await import('mammoth'))
  const { value } = await lib.extractRawText({ buffer: toBuffer(buf) })
  return clean(value)
}

async function xlsxText(buf: Uint8Array): Promise<string> {
  const ExcelJS = interop(await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(toBuffer(buf) as unknown as ArrayBuffer)
  const parts: string[] = []
  wb.eachSheet((ws) => {
    const lines: string[] = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: false }, (cell) => {
        let t = ''
        try { t = cell.text } catch { t = '' }
        t = t.replace(/\s+/g, ' ').trim()
        if (t) cells.push(t)
      })
      if (cells.length > 0) lines.push(cells.join(' | '))
    })
    if (lines.length > 0) parts.push(`גיליון: ${ws.name}\n${lines.join('\n')}`)
  })
  return clean(parts.join('\n\n'))
}

interface PdfModule {
  getDocument: (src: Record<string, unknown>) => { promise: Promise<PdfDocument>; destroy: () => Promise<void> }
}
interface PdfDocument {
  numPages: number
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean }[] }> }>
}

let pdfjsPromise: Promise<PdfModule> | null = null

/** pdf.js with its worker supplied in-process, so nothing is loaded from disk at run time. */
function loadPdfjs(): Promise<PdfModule> {
  pdfjsPromise ??= (async () => {
    // @ts-ignore — the worker module ships without type declarations
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
    return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule
  })()
  return pdfjsPromise
}

async function pdfText(buf: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  })
  const doc = await task.promise
  try {
    const pages = doc.numPages
    const out: string[] = []
    for (let i = 1; i <= Math.min(pages, MAX_PDF_PAGES); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let line = ''
      for (const item of content.items) {
        line += item.str ?? ''
        line += item.hasEOL ? '\n' : ' '
      }
      const t = line.replace(/[ \t]+/g, ' ').trim()
      if (t) out.push(`[עמוד ${i}]\n${t}`)
    }
    return { text: clean(out.join('\n\n')), pages }
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

export async function extractText(buf: Uint8Array, name: string, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const kind = detectKind(buf, name)
  switch (kind) {
    case 'docx':
      return { kind, text: await docxText(buf) }
    case 'xlsx':
      return { kind, text: await xlsxText(buf) }
    case 'text':
      return { kind, text: clean(new TextDecoder('utf-8').decode(buf)) }
    case 'pdf': {
      const { text, pages } = await pdfText(buf)
      const plain = text.replace(/\[עמוד \d+\]/g, '').trim()
      if (plain.length < MIN_CHARS_PER_PAGE * Math.max(1, Math.min(pages, MAX_PDF_PAGES))) {
        if (opts.ocr) {
          const ocr = clean(await opts.ocr(buf))
          if (ocr) return { kind, text: ocr, pages, note: 'נקרא בזיהוי תווים (OCR)' }
        }
        // Whatever little text there is (a header, page numbers) is kept; the rest is an image.
        return { kind, text: plain ? text : '', pages, scanned: true, note: 'קובץ סרוק — רוב התוכן הוא תמונה שאי אפשר לקרוא בלי זיהוי תווים' }
      }
      return { kind, text, pages }
    }
    default:
      return { kind, text: '', note: `סוג קובץ שאי אפשר לקרוא (${extOf(name) || 'ללא סיומת'})` }
  }
}
