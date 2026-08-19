/**
 * Rebuilds roles, the org hierarchy and contacts from the single authoritative
 * source: public/templates/tafkidim-veanshei-kesher-2026.xlsx
 *   sheet "תפקידים שכן טוב"  → roles + reporting lines
 *   sheet "אנשי קשר חשובים"  → contacts
 *
 * Deviation from the sheet, per explicit instruction: HQ roles (מטה / ועד מנהל)
 * carry no area — the sheet lists "ירושלים" for them, but HQ is not a region.
 *
 * Usage: node scripts/seed-org.mjs
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execFileSync } from 'child_process'

const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ?? '/root/.claude/uploads/8ffa83cb-c50c-5072-9f83-eeaa819b9bcb/9113bd15-shachentovcrmfirebaseadminsdkfbsvcb312d1804d.json'
if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(SA_PATH), 'utf8'))) })
}
const db = getFirestore()

const XLSX = 'public/templates/tafkidim-veanshei-kesher-2026.xlsx'

/** Section header in the sheet → the level stored on the role. */
const SECTIONS = {
  'מטה - ועד מנהל': 'ועד מנהל',
  'מטה': 'מטה',
  'סניפי חלוקת מזון - חוץ': 'סניף חוץ',
  'סניפי חלוקת מזון - ירושלים': 'סניף ירושלים',
  'בתי קפה נודדים': 'בתי קפה נודדים',
  'טוסטר': 'טוסטר',
  'סניפי ופרוייקטים עיתיים': 'סניפים עיתיים',
}
const HQ_LEVELS = new Set(['ועד מנהל', 'מטה'])

const STATUS = (raw) => {
  const s = (raw || '').trim()
  if (s.startsWith('יציב')) return 'מאויש'
  if (s.startsWith('דחוף')) return 'חסר'
  if (s.startsWith('בינוני')) return 'חלקי'
  if (s.startsWith('בחפיפה')) return 'חלקי'
  return s ? 'אחר' : 'חסר'
}
const PRIORITY = (raw) => {
  const s = (raw || '').trim()
  if (s.startsWith('דחוף')) return 'דחוף'
  if (s.startsWith('בינוני')) return 'בינוני'
  return 'רגיל'
}

function readSheet(name, maxCol) {
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(${JSON.stringify(XLSX)}, data_only=True)
ws = wb[${JSON.stringify(name)}]
rows = [[('' if c is None else str(c).strip()) for c in r]
        for r in ws.iter_rows(min_col=1, max_col=${maxCol}, values_only=True)]
print(json.dumps([r for r in rows if any(r)], ensure_ascii=False))
`
  return JSON.parse(execFileSync('python3', ['-c', py], { encoding: 'utf8', maxBuffer: 1 << 24 }))
}

// The sheet is a rigid 7-column table — תפקיד | אזור הפעילות | אחראי | טלפון |
// מייל | סטטוס | הערות נוספות — so every cell is read by fixed position.
// (An earlier version scanned each row for "the first cell that doesn't look
// like a phone/email/status" to guess the holder's name. That heuristic broke
// whenever the area column held a plain word like 'ירושלים' — nothing
// distinguishes it from a name — or when a vacant role's notes column held
// free text like 'מעל גיל 23', which then got misread as the holder's name.)
const clean = (v) => (v === 'חסר' ? '' : (v || '').trim())

// The sheet's "אזור הפעילות" column is only filled on the first row of a
// section (a merged-cell convention) and, even there, only says the city
// ("ירושלים") — the actual branch/neighborhood that should group coordinators
// in the org chart (גילה, רמות, בקעה...) lives only in the free-text role
// name. Extract it from there for the levels where it matters.
const NAME_AREA_SPLIT = {
  'סניף ירושלים': 'ירושלים',
  'טוסטר': 'נוער',
  'בתי קפה נודדים': 'נודד',
}
function branchAreaFromName(level, roleName) {
  const marker = NAME_AREA_SPLIT[level]
  if (!marker) return ''
  const [, rest] = roleName.split(marker)
  return rest ? rest.replace(/^[\s-]+/, '').trim() : ''
}

function parseRoles() {
  const rows = readSheet('תפקידים שכן טוב', 7)
  const roles = []
  let level = null
  let current = null   // the role a bare extra-holder row belongs to

  for (const row of rows) {
    const [roleName, area, holder, phone, email, status, notes] = row
    if (roleName === 'תפקיד') continue
    if (SECTIONS[roleName] && ![area, holder, phone, email, status, notes].some(Boolean)) {
      level = SECTIONS[roleName]
      current = null
      continue
    }
    if (!level) continue

    const startsRole = !!roleName
    if (startsRole) {
      // The area column is only meaningful for branches — HQ roles are not a region.
      const resolvedArea = HQ_LEVELS.has(level)
        ? ''
        : (branchAreaFromName(level, roleName) || clean(area))
      current = { roleName, level, area: resolvedArea, holders: [] }
      roles.push(current)
    }
    if (!current) continue

    current.holders.push({
      holder: clean(holder),
      phone: clean(phone),
      email: clean(email),
      statusRaw: (status || '').trim(),
      notes: (notes || '').trim(),
    })
  }
  return roles
}

// ── Reporting lines ─────────────────────────────────────────────────────────
// Keyed by role name so they survive re-numbering.
const CEO = 'מנכ"ל'
const PARENT_BY_ROLE = {
  // מטה reports into the board member who owns the area
  'רכז תרומות': 'רכזת תרומות ופרוייקטים מיוחדים',
}
const PARENT_BY_LEVEL = {
  'ועד מנהל': CEO,
  'מטה': CEO,
  'סניף ירושלים': 'מנהל סניפי מזון ירושלים',
  'סניף חוץ': 'מנהל סניפי חוץ',
  'בתי קפה נודדים': 'מנהל בתי קפה נודדים',
  'טוסטר': 'מנהל מועדוני נוער',
  'סניפים עיתיים': CEO,
}

/**
 * The sheet has no "מנהל סניפי חוץ" row, but external branches are supposed to
 * report to one. Added as a vacant board role so the tree matches the org.
 */
const SYNTHETIC = [{
  roleName: 'מנהל סניפי חוץ', level: 'ועד מנהל', area: '',
  holders: [{ holder: '', phone: '', email: '', statusRaw: 'דחוף', notes: 'לא מופיע בקובץ התפקידים — נוסף כדי שסניפי החוץ יהיו כפופים אליו' }],
}]

async function seedRoles() {
  const parsed = [...parseRoles(), ...SYNTHETIC]

  const old = await db.collection('roles').get()
  let batch = db.batch()
  old.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()

  // First pass: allocate ids so parents can be resolved by role name.
  const idByRoleName = new Map()
  const docs = []
  const counters = {}
  const prefix = { 'ועד מנהל': 'BOARD', 'מטה': 'HQ', 'סניף חוץ': 'BRC', 'סניף ירושלים': 'BRJ', 'בתי קפה נודדים': 'CAFE', 'טוסטר': 'TOAST', 'סניפים עיתיים': 'ETIM' }

  for (const role of parsed) {
    for (const h of role.holders) {
      const p = prefix[role.level] ?? 'ROLE'
      counters[p] = (counters[p] ?? 0) + 1
      const id = `${p}-${String(counters[p]).padStart(2, '0')}`
      if (!idByRoleName.has(role.roleName)) idByRoleName.set(role.roleName, id)
      docs.push({ id, role, h })
    }
  }

  let seeded = 0
  for (const { id, role, h } of docs) {
    const parentName = PARENT_BY_ROLE[role.roleName] ?? PARENT_BY_LEVEL[role.level]
    const reportsTo = role.roleName === CEO ? null : (idByRoleName.get(parentName) ?? idByRoleName.get(CEO))
    const data = {
      id,
      roleName: role.roleName,
      level: role.level,
      area: role.area ?? '',
      holderName: h.holder,
      status: h.holder ? STATUS(h.statusRaw) : 'חסר',
      priority: PRIORITY(h.statusRaw),
      email: h.email,
      phone: h.phone,
      linkedTaskIds: [],
      affectsTasks: false,
      delegatedTo: null,
      notes: h.notes ?? '',
    }
    if (reportsTo) data.reportsTo = reportsTo
    await db.collection('roles').doc(id).set(data)
    seeded++
  }

  const byLevel = {}
  parsed.forEach((r) => { byLevel[r.level] = (byLevel[r.level] ?? 0) + r.holders.length })
  console.log(`✓ ${seeded} roles seeded (was ${old.size})`)
  console.log('  by level:', JSON.stringify(byLevel))
  return idByRoleName
}

// ── Contacts ────────────────────────────────────────────────────────────────

async function seedContacts() {
  const rows = readSheet('אנשי קשר חשובים', 7)
  const old = await db.collection('contacts').get()
  const batch = db.batch()
  old.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()

  // Explicit header list: a supplier row can also be a lone first cell (the
  // sheet lists several suppliers by name only), so "single cell" is not a
  // reliable test for a section break.
  const HEADERS = new Set([
    'אנשי קשר כללי',
    'ספקים פרוייקט סלי מזון',
    'ספקים ארבעת המינים',
    'אנשי קשר מועדוני נוער',
    'תורמים קבועים',
  ])

  let category = 'כללי'
  let n = 0
  const missing = []

  for (const row of rows) {
    const [company, roleTitle, person, phone, email, owner, cadence] = row
    // Section headers sit in column B for every group after the first.
    const header = row.find((c) => HEADERS.has(c))
    if (header) { category = header; continue }
    // A row is a contact if it names a company OR a person — e.g. "שמוליק
    // אלקלעי, מנהל חשבונות" has no company cell at all, only a role + person.
    if (!company && !person) continue
    if (company === 'שם חברה') continue

    n++
    const id = `CT-${String(n).padStart(3, '0')}`
    const phoneClean = (phone || '').replace(/[‎‏]/g, '').trim()
    const gaps = []
    if (!phoneClean && !email) gaps.push('חסרים פרטי קשר')
    else if (!phoneClean) gaps.push('חסר טלפון')
    if (gaps.length) missing.push(`${category} — ${company}`)

    const CONTACT_TYPE = {
      'ספקים פרוייקט סלי מזון': 'ספק',
      'ספקים ארבעת המינים': 'ספק',
      'תורמים קבועים': 'תורם',
    }
    await db.collection('contacts').doc(id).set({
      id,
      name: person || company,
      type: CONTACT_TYPE[category] ?? 'מטה',
      domainTags: [],
      organization: company,
      role: roleTitle || '',
      category,
      phone: phoneClean,
      email: email || '',
      ownerInOrg: owner || '',
      cadence: cadence || '',
      notes: gaps.join(' · '),
      needsInfo: gaps.length > 0,
      createdBy: 'seed',
    })
  }

  console.log(`✓ ${n} contacts seeded (was ${old.size})`)
  if (missing.length) {
    console.log(`\n⚠ ${missing.length} contacts missing phone/email — flagged with needsInfo:`)
    missing.forEach((m) => console.log(`   ${m}`))
  }

  await seedRoleContacts(n)
}

// Branch coordinators and org activists (role holders from "תפקידים שכן טוב")
// belong in the Contacts tab too, so they can be found and reached without
// leaving the page — but as their own labeled section, distinct from the
// suppliers/donors/general contacts above which come from a different sheet.
const ROLE_CONTACT_CATEGORY = 'רכזי סניפים ופעילי עמותה'

async function seedRoleContacts(startIndex) {
  const parsed = parseRoles()
  let n = startIndex
  let created = 0
  for (const role of parsed) {
    for (const h of role.holders) {
      if (!h.holder) continue // vacant role — no person to list as a contact
      n++
      const id = `RC-${String(n).padStart(3, '0')}`
      await db.collection('contacts').doc(id).set({
        id,
        name: h.holder,
        type: 'מטה',
        domainTags: [],
        organization: 'שכן טוב',
        role: role.roleName,
        category: ROLE_CONTACT_CATEGORY,
        phone: h.phone,
        email: h.email,
        ownerInOrg: '',
        cadence: '',
        notes: h.notes ?? '',
        needsInfo: !h.phone && !h.email,
        createdBy: 'seed',
      })
      created++
    }
  }
  console.log(`✓ ${created} role-holder contacts seeded under "${ROLE_CONTACT_CATEGORY}"`)
}

async function main() {
  console.log('=== Rebuilding org + contacts from the roles sheet ===\n')
  await seedRoles()
  console.log('')
  await seedContacts()

  const all = await db.collection('roles').get()
  const roots = all.docs.filter((d) => !d.data().reportsTo)
  console.log(`\nroots: ${roots.map((d) => `${d.id} ${d.data().roleName}`).join(', ') || '(none)'}`)
  process.exit(0)
}

main().catch((err) => { console.error('Error:', err); process.exit(1) })
