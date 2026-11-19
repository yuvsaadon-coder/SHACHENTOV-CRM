// One-time import of the owner's price-tracking spreadsheet into seed/price-history.json.
// Run:  node scripts/import-price-history.mjs [path-to-xlsx]
// Layout (docs/price-history/price-tracking-original.xlsx): row 2 = period start dates, row 3 = supplier,
// row 4 = headers ("מחיר כולל מעמ" / "שינוי אחוזי"), rows 5.. = products. 0 or empty = not supplied that period.
import ExcelJS from 'exceljs'
import fs from 'node:fs'

const file = process.argv[2] ?? new URL('../docs/price-history/price-tracking-original.xlsx', import.meta.url).pathname
const out = new URL('../seed/price-history.json', import.meta.url).pathname

// Name in the spreadsheet -> catalog product id (seed.json). null = not in the catalog (kept as a history-only item).
const MAP = {
  'פסטה': 'pasta', 'אורז': 'rice', 'מיץ לא בתרומה': 'grape', 'רסק': 'paste', 'מלפפונים חמוצים': 'pickles',
  'שעועית ברוטב': 'beans-r', 'שמן': 'oil', 'טונה': 'tuna', 'קוסקוס': 'couscous', 'פתיתים': 'ptitim', 'זיתים': 'olives',
  'תירס': 'corn', 'אפונה וגזר': null, 'טחינה': 'tahini', 'כוסמת': 'buckwheat', 'שעועית לבנה': 'beans-w', 'גריסים': 'grits',
  'בורגול': 'bulgur', 'אפונה': 'peas', 'חיטה': 'wheat', 'חומוס בשימורים': 'chickpeas', 'אננס': 'fruit-can',
  'פטריות': 'mushrooms', 'ממרח שוקולד': 'choco', 'קפה': 'coffee', 'סוכר': 'sugar', 'קמח': 'flour',
}

const val = (c) => {
  const v = c?.value
  if (v == null) return null
  if (typeof v === 'object' && 'result' in v) return v.result ?? null
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('')
  return v
}

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]
const periods = []
for (let col = 2; col <= ws.columnCount; col++) {
  const d = val(ws.getRow(2).getCell(col))
  const head = String(val(ws.getRow(4).getCell(col)) ?? '')
  if (!(d instanceof Date) || !head.includes('מחיר')) continue
  const month = d.getUTCMonth() + 1
  const id = `${d.getUTCFullYear()}-${month <= 6 ? 'H1' : 'H2'}`
  periods.push({ col, id, supplier: String(val(ws.getRow(3).getCell(col)) ?? '').trim() })
}

const items = []
const prices = Object.fromEntries(periods.map((p) => [p.id, {}]))
for (let r = 5; r <= ws.rowCount; r++) {
  const name = String(val(ws.getRow(r).getCell(1)) ?? '').trim()
  if (!name || name.startsWith('שינוי')) continue
  if (!(name in MAP)) throw new Error(`No mapping for "${name}" (row ${r}). Add it to MAP.`)
  const productId = MAP[name]
  const key = productId ?? `name:${name}`
  items.push({ key, name, productId })
  for (const p of periods) {
    const n = Number(val(ws.getRow(r).getCell(p.col)))
    if (Number.isFinite(n) && n > 0) prices[p.id][key] = Math.round(n * 1e6) / 1e6
  }
}

const result = {
  _comment: 'Imported from docs/price-history/price-tracking-original.xlsx by scripts/import-price-history.mjs. Prices include VAT. Missing = not supplied that half-year. Do not edit by hand; re-run the script.',
  items,
  periods: periods
    .filter((p) => Object.keys(prices[p.id]).length > 0)
    .map((p) => ({ id: p.id, supplier: p.supplier, prices: prices[p.id] })),
}
fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n')
console.log(`wrote ${out}: ${items.length} items, periods ${result.periods.map((p) => `${p.id}(${p.supplier || '-'}, ${Object.keys(p.prices).length})`).join(' ')}`)
