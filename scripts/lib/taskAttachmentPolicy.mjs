/**
 * Which seeded files belong on which holiday task.
 *
 * The holiday order formats (price-quote requests, supplier formats, supplier
 * contacts, coordination/costing sheet) are about ordering for Passover and
 * Rosh Hashana only. Other holidays have their own dedicated items described in
 * the task itself, so they carry no order files. The jerusalem coordinator's
 * handover file is never a holiday-task attachment.
 */
export const HOLIDAY_CATEGORIES = new Set(['חלוקות חגים', 'חגים – ריכוז-על', 'רכש חגים', 'פסח', 'ראש השנה'])

const PESACH_RFQ = 'pesach-bakasha-hatzaat-mechir.xlsx'
const ROSH_HASHANA_RFQ = 'rosh-hashana-bakasha-hatzaat-mechir.xlsx'
const HANDOVER = 'hafifa-rakaz-yerushalayim.docx'

const baseName = (url) => decodeURIComponent((url ?? '').split('/').pop() ?? '')

/** True when the seeded file at `url` should stay on (or be given to) the task. */
export function keepFile(task, url) {
  if (!HOLIDAY_CATEGORIES.has(task.category)) return true
  const name = baseName(url)
  if (name === HANDOVER) return false
  if (task.holidayAnchor === 'פסח') return name !== ROSH_HASHANA_RFQ
  if (task.holidayAnchor === 'ראש השנה') return name !== PESACH_RFQ
  return false
}
