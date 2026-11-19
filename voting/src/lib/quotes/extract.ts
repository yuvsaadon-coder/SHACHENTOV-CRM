// Browser-side reading of uploaded quote files. Heavy libraries are loaded only when needed.
import type { QuoteSource } from './types'

export const AI_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
/** Netlify accepts request bodies up to 6 MB; base64 grows the file by a third. */
export const MAX_AI_FILE_BYTES = 4 * 1024 * 1024
export const ACCEPT = '.xlsx,.csv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.gif'

export class UnsupportedFileError extends Error {}

function ext(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const delim = (text.split('\n')[0] ?? '').split(';').length > (text.split('\n')[0] ?? '').split(',').length ? ';' : ','
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const rows: string[][] = []
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (r) => {
      const cells: string[] = []
      r.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cell.text ?? '' })
      rows.push(Array.from(cells, (c) => c ?? ''))
    })
  })
  return rows
}

/** Text of a PDF, one visual line per line (used only by the no-AI fallback). */
export async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const byY = new Map<number, { x: number; s: string }[]>()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const y = Math.round(it.transform[5] as number)
      const list = byY.get(y) ?? []
      list.push({ x: it.transform[4] as number, s: it.str })
      byY.set(y, list)
    }
    // top to bottom; right to left within a line (Hebrew documents)
    for (const y of [...byY.keys()].sort((a, b) => b - a)) out.push(byY.get(y)!.sort((a, b) => b.x - a.x).map((i) => i.s).join(' '))
  }
  return out.join('\n')
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function mediaTypeOf(file: File): string {
  if (file.type) return file.type
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' } as Record<string, string>)[ext(file.name)] ?? ''
}

export interface ReadFile {
  name: string
  /** what the AI analysis receives */
  source: QuoteSource
  /** fallback reading without AI (null = not possible, e.g. a photo) */
  fallback: () => Promise<QuoteSource | null>
}

export async function readQuoteFile(file: File): Promise<ReadFile> {
  const e = ext(file.name)
  const buf = await file.arrayBuffer()
  if (e === 'xlsx') {
    const rows = await readXlsx(buf)
    return { name: file.name, source: { kind: 'rows', rows }, fallback: async () => ({ kind: 'rows', rows }) }
  }
  if (e === 'csv' || e === 'txt') {
    const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '')
    const src: QuoteSource = e === 'csv' ? { kind: 'rows', rows: parseCsv(text) } : { kind: 'text', text }
    return { name: file.name, source: src, fallback: async () => src }
  }
  const mediaType = mediaTypeOf(file)
  if (AI_FILE_TYPES.includes(mediaType)) {
    if (buf.byteLength > MAX_AI_FILE_BYTES) throw new UnsupportedFileError('too_big')
    return {
      name: file.name,
      source: { kind: 'file', mediaType, base64: toBase64(buf) },
      fallback: async () => (mediaType === 'application/pdf' ? { kind: 'text', text: await pdfText(buf) } : null),
    }
  }
  throw new UnsupportedFileError(e === 'xls' ? 'xls' : 'type')
}
