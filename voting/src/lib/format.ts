const money2 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money0 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Money for display. Always rounds to at most 2 decimals. */
export function money(n: number, opts: { trim?: boolean } = {}): string {
  return (opts.trim ? money0 : money2).format(Math.round(n * 100) / 100)
}

const num1 = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const num2 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 })
export const fmt1 = (n: number): string => num1.format(n)
export const fmt2 = (n: number): string => num2.format(n)
