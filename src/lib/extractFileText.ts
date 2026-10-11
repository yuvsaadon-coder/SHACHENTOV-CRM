/**
 * Client-side text extraction from uploaded files.
 * Returns the extracted text (trimmed to 10 000 chars), or null if the file
 * type is unsupported or extraction fails.
 */
export async function extractFileText(file: File): Promise<string | null> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    return extractDocx(file)
  }
  if (name.endsWith('.pdf')) {
    return extractPdf(file)
  }
  if (file.type.startsWith('text/')) {
    return file.text().then((t) => t.slice(0, 10_000))
  }
  return null
}

async function extractDocx(file: File): Promise<string | null> {
  try {
    const { extractRawText } = await import('mammoth')
    const buf = await file.arrayBuffer()
    const result = await extractRawText({ arrayBuffer: buf })
    const text = result.value.trim()
    return text.length > 0 ? text.slice(0, 10_000) : null
  } catch {
    return null
  }
}

async function extractPdf(file: File): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    // Use a CDN worker so we don't need to bundle/host it ourselves
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'

    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const tc = await page.getTextContent()
      pages.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' '))
    }
    const text = pages.join('\n').trim()
    return text.length > 0 ? text.slice(0, 10_000) : null
  } catch {
    return null
  }
}
