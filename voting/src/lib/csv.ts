/** CSV with BOM so Excel opens Hebrew correctly. Cells are always quoted; formula-like cells are neutralised. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (c: string | number) => {
    let s = String(c)
    if (/^[=+\-@\t\r]/.test(s) && typeof c === 'string') s = `'${s}` // CSV/formula injection guard
    return `"${s.replace(/"/g, '""')}"`
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')
}

export function downloadCsv(rows: (string | number)[][], filename: string): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
