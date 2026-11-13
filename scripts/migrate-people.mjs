/**
 * One-time migration to a single people directory.
 *
 * Before: "who holds what" was stored in several places that drifted apart —
 *   roles.holderName / uid / coHolders / phone / email, branches.coordinatorUids /
 *   coordinatorNames, a copy of every role holder in `contacts`, and `users`.
 * After:  `users` is the only place a person lives. users.roleIds says which
 *   positions they hold; everything else is derived from it by the app.
 *
 * Usage (always start with a dry run — it writes nothing and prints a report):
 *   node scripts/migrate-people.mjs --key /path/to/service-account.json
 *   node scripts/migrate-people.mjs --key ... --apply
 *   node scripts/migrate-people.mjs --key ... --apply --reset-hq-passwords [--skip-email a@b.c]
 *   node scripts/migrate-people.mjs --key ... --cleanup     (after the new app + rules are live)
 *
 * --apply only ADDS data (roleIds / branchIds / phone on people, new people,
 * portal links on roles), so the currently deployed app keeps working.
 * --cleanup then removes the old duplicated fields.
 */
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { readFileSync, writeFileSync } from 'fs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const options = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []))

const APPLY = flag('--apply')
const CLEANUP = flag('--cleanup')
const FORCE = flag('--force')
const RESET_PASSWORDS = flag('--reset-hq-passwords')
const SKIP_EMAILS = options('--skip-email').map((e) => e.toLowerCase())
const REPORT_PATH = option('--report')

if (!getApps().length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-shachentov' })
  } else {
    const key = option('--key') ?? process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    if (!key) { console.error('Missing --key /path/to/service-account.json'); process.exit(1) }
    initializeApp({ credential: cert(JSON.parse(readFileSync(key, 'utf8'))) })
  }
}
const db = getFirestore()

const LEGACY_CONTACT_CATEGORY = 'רכזי סניפים ופעילי עמותה'
const FORMER_CATEGORY = 'בעלי תפקידים לשעבר'
const BRANCH_LEVELS = ['סניף חוץ', 'סניף ירושלים', 'בתי קפה נודדים', 'טוסטר', 'סניפים עיתיים', 'יריד']
const NO_STAFF = ['', 'coordinator', 'none']

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const norm = (s) => String(s ?? '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/["״'׳.,]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
const tokens = (s) => norm(s).split(' ').filter(Boolean)
const isInternalEmail = (e) => !e || String(e).endsWith('.internal')

function branchLevel(b) {
  if (b.type === 'cafe_youth') return 'בתי קפה נודדים'
  return String(b.city ?? '').startsWith('ירושלים') ? 'סניף ירושלים' : 'סניף חוץ'
}

async function loadAll(name) {
  const snap = await db.collection(name).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

async function commitInBatches(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 400)) op(batch)
    await batch.commit()
  }
}

// ── Cleanup phase ────────────────────────────────────────────────────────────

async function cleanup() {
  const marker = await db.collection('meta').doc('peopleMigration').get()
  if (!marker.exists && !FORCE) {
    console.error('The migration has not been applied yet — run with --apply first.')
    process.exit(1)
  }
  const [roles, branches, users] = await Promise.all([loadAll('roles'), loadAll('branches'), loadAll('users')])
  const del = FieldValue.delete()
  const ops = []
  for (const r of roles) {
    if (['holderName', 'uid', 'coHolders', 'phone', 'email'].some((k) => k in r)) {
      ops.push((b) => b.update(db.collection('roles').doc(r.id), { holderName: del, uid: del, coHolders: del, phone: del, email: del }))
    }
  }
  for (const br of branches) {
    if ('coordinatorUids' in br || 'coordinatorNames' in br) {
      ops.push((b) => b.update(db.collection('branches').doc(br.id), { coordinatorUids: del, coordinatorNames: del }))
    }
  }
  for (const u of users) {
    const fields = {}
    if ('branchId' in u) fields.branchId = del
    if ('storedPassword' in u) fields.storedPassword = del
    // Placeholder addresses of coordinators were never real mailboxes.
    if (isInternalEmail(u.email) && u.email) fields.email = ''
    if (Object.keys(fields).length) ops.push((b) => b.update(db.collection('users').doc(u.id), fields))
  }
  await commitInBatches(ops)
  await db.collection('meta').doc('peopleMigration').set({ cleanedAt: FieldValue.serverTimestamp() }, { merge: true })
  console.log(`✓ Removed the old duplicated fields from ${ops.length} documents.`)
}

// ── Migration ────────────────────────────────────────────────────────────────

async function migrate() {
  const marker = await db.collection('meta').doc('peopleMigration').get()
  if (APPLY && marker.exists && !FORCE) {
    console.error('Already applied. Re-running would re-attach people the team has since moved in the app. Use --force only if you are sure.')
    process.exit(1)
  }

  const [users, roles, branches, contacts, tasks] = await Promise.all(
    ['users', 'roles', 'branches', 'contacts', 'tasks'].map(loadAll))

  const report = {
    counts: {},
    matchedByName: [], matchedByPhone: [], createdPeople: [], ambiguous: [],
    detailConflicts: [], multiNameHolders: [],
    branchLinks: [], genericBranchRoles: [], branchProblems: [],
    coordinatorsWithoutBranch: [], portalHoldersWithoutAccess: [],
    contactsRemoved: [], contactsKept: [], contactsToFormer: [],
    passwords: [],
  }

  // people: working copy keyed by id
  const people = new Map(users.map((u) => [u.id, {
    id: u.id, isNew: false, name: u.name ?? '', role: u.role ?? '', active: u.active !== false,
    phone: digits(u.phone), email: String(u.email ?? '').trim().toLowerCase(),
    origPhone: u.phone ?? '', origEmail: u.email ?? '',
    roleIds: new Set(u.roleIds ?? []), storedPassword: u.storedPassword,
  }]))
  let newCounter = 0
  const newId = () => db.collection('users').doc().id

  function findPerson(name, phone) {
    const n = norm(name)
    const ph = digits(phone)
    const all = [...people.values()]
    if (n) {
      const exact = all.filter((p) => norm(p.name) === n)
      if (exact.length === 1) return { person: exact[0], how: 'name' }
      if (exact.length > 1) {
        const byPhone = exact.filter((p) => ph && p.phone === ph)
        if (byPhone.length === 1) return { person: byPhone[0], how: 'name' }
        return { ambiguous: exact.map((p) => p.name + ' [' + p.id + ']') }
      }
    }
    if (ph) {
      // Same phone and one name contained in the other ("נעמי" / "נעמי כהן").
      const t = tokens(name)
      const cands = all.filter((p) => {
        if (p.phone !== ph) return false
        const pt = tokens(p.name)
        if (!t.length || !pt.length) return false
        return t.every((x) => pt.includes(x)) || pt.every((x) => t.includes(x))
      })
      if (cands.length === 1) return { person: cands[0], how: 'phone' }
      if (cands.length > 1) return { ambiguous: cands.map((p) => p.name + ' [' + p.id + ']') }
    }
    return {}
  }

  function fillDetails(person, phone, email, where) {
    const ph = digits(phone)
    const em = String(email ?? '').trim().toLowerCase()
    if (ph) {
      if (!person.phone) person.phone = ph
      else if (person.phone !== ph) report.detailConflicts.push(`${person.name}: טלפון ${person.phone} ברשומת האדם, ${ph} ב${where} — נשמר ${person.phone}`)
    }
    if (em && !isInternalEmail(em)) {
      if (isInternalEmail(person.email)) person.email = em
      else if (person.email !== em) report.detailConflicts.push(`${person.name}: אימייל ${person.email} ברשומת האדם, ${em} ב${where} — נשמר ${person.email}`)
    }
  }

  // Names that represent two people listed together — split into separate entries.
  const NAME_SPLITS = {
    'רן ושירה שרון': ['רן שרון', 'שירה שרון'],
  }

  // 1. Role holders → people
  for (const r of roles) {
    const label = `${r.roleName}${r.area ? ' — ' + r.area : ''}`
    const rawEntries = []
    if (r.holderName || r.uid) rawEntries.push({ name: r.holderName ?? '', uid: r.uid, phone: r.phone, email: r.email })
    for (const c of r.coHolders ?? []) if (c?.name || c?.uid) rawEntries.push({ name: c.name ?? '', uid: c.uid })
    const entries = []
    for (const e of rawEntries) {
      const splits = NAME_SPLITS[e.name.trim()]
      if (splits && !e.uid) {
        for (const splitName of splits) entries.push({ ...e, name: splitName })
      } else {
        entries.push(e)
      }
    }

    for (const e of entries) {
      if (/[\/,]| ו[א-ת]+ [א-ת]+$/.test(e.name) && !e.uid) {
        report.multiNameHolders.push(`${label}: "${e.name}"`)
      }
      let person = e.uid ? people.get(e.uid) : undefined
      if (!person) {
        const found = findPerson(e.name, e.phone)
        if (found.ambiguous) {
          report.ambiguous.push(`${label}: "${e.name}" מתאים ליותר מרשומה אחת (${found.ambiguous.join(' | ')}) — לא שויך`)
          continue
        }
        if (found.person) {
          person = found.person
          const line = `${e.name} ← ${person.name} (${label})`
          if (found.how === 'phone') report.matchedByPhone.push(line)
          else report.matchedByName.push(line)
        }
      }
      if (!person) {
        if (!norm(e.name)) continue
        person = {
          id: newId(), isNew: true, name: String(e.name).replace(/\s+/g, ' ').trim(), role: 'none', active: true,
          phone: '', email: '', origPhone: '', origEmail: '', roleIds: new Set(),
        }
        people.set(person.id, person)
        newCounter++
        report.createdPeople.push(`${person.name} (${label})`)
      }
      fillDetails(person, e.phone, e.email, `תפקיד "${label}"`)
      if (person.active) person.roleIds.add(r.id)
    }
  }

  // 2. Branch coordinators → positions linked to the branch
  const rolesById = new Map(roles.map((r) => [r.id, { ...r, newPortalBranchId: r.portalBranchId }]))
  const newRoles = []
  for (const br of branches) {
    const linkedIds = () => [...rolesById.values()].filter((r) => r.newPortalBranchId === br.id).map((r) => r.id)
    let generic = null
    for (const uid of br.coordinatorUids ?? []) {
      const person = people.get(uid)
      if (!person) { report.branchProblems.push(`${br.name}: רכז עם מזהה ${uid} לא קיים במשתמשים`); continue }
      if (!person.active) continue
      if (linkedIds().some((id) => person.roleIds.has(id))) continue

      // A branch-level position this person already holds becomes the branch's position.
      const own = [...person.roleIds].map((id) => rolesById.get(id))
        .filter((r) => r && BRANCH_LEVELS.includes(r.level) && !r.newPortalBranchId)
      if (own.length === 1) {
        own[0].newPortalBranchId = br.id
        report.branchLinks.push(`${br.name} ← תפקיד "${own[0].roleName}${own[0].area ? ' — ' + own[0].area : ''}" (דרך ${person.name})`)
        continue
      }
      if (own.length > 1) {
        report.branchProblems.push(`${br.name}: ל${person.name} כמה תפקידי סניף אפשריים (${own.map((r) => r.roleName + (r.area ? ' — ' + r.area : '')).join(' | ')}) — שויך לתפקיד הרכז/ת של הסניף`)
      }
      const existing = linkedIds()
      if (existing.length >= 1) {
        person.roleIds.add(existing[0])
        continue
      }
      if (!generic) {
        generic = {
          id: db.collection('roles').doc().id,
          roleName: 'רכז/ת סניף', area: String(br.name ?? '').replace(/^סלי מזון - /, ''),
          level: branchLevel(br), status: 'מאויש', priority: 'רגיל', linkedTaskIds: [], affectsTasks: false,
          delegatedTo: null, notes: '', newPortalBranchId: br.id, isNew: true,
        }
        rolesById.set(generic.id, generic)
        newRoles.push(generic)
        report.genericBranchRoles.push(`${br.name}: נוצר תפקיד "רכז/ת סניף — ${generic.area}"`)
      }
      person.roleIds.add(generic.id)
    }
  }

  // 3. Derived fields + sanity lists
  for (const p of people.values()) {
    p.branchIds = [...new Set([...p.roleIds].map((id) => rolesById.get(id)?.newPortalBranchId).filter(Boolean))]
    if (p.role === 'coordinator' && p.active && p.branchIds.length === 0) report.coordinatorsWithoutBranch.push(p.name)
    if (p.branchIds.length > 0 && NO_STAFF.includes(p.role) && p.role !== 'coordinator' && p.active) {
      report.portalHoldersWithoutAccess.push(`${p.name} (${p.branchIds.map((id) => branches.find((b) => b.id === id)?.name ?? id).join(', ')})`)
    }
  }

  // 4. The stored copy of role holders in contacts
  const referenced = new Set(tasks.flatMap((t) => t.contactRefs ?? []))
  const holderNames = new Set([...people.values()].filter((p) => p.active && p.roleIds.size > 0).map((p) => norm(p.name)))
  const contactOps = []
  for (const c of contacts) {
    if (c.category !== LEGACY_CONTACT_CATEGORY) continue
    if (holderNames.has(norm(c.name))) {
      if (referenced.has(c.id)) { report.contactsKept.push(`${c.name} (${c.id}) — מקושר למשימה, נשאר`); continue }
      report.contactsRemoved.push(c.name)
      contactOps.push((b) => b.delete(db.collection('contacts').doc(c.id)))
    } else {
      report.contactsToFormer.push(`${c.name} (${c.role ?? ''})`)
      contactOps.push((b) => b.update(db.collection('contacts').doc(c.id), { category: FORMER_CATEGORY }))
    }
  }

  // 5. Passwords of HQ logins
  const staff = [...people.values()].filter((p) => !p.isNew && p.active && !NO_STAFF.includes(p.role))
  const secretOps = []
  for (const p of staff) {
    if (p.storedPassword) {
      secretOps.push((b) => b.set(db.collection('userSecrets').doc(p.id), { password: p.storedPassword, setBy: 'migration', setAt: FieldValue.serverTimestamp() }))
    }
    if (!RESET_PASSWORDS) {
      report.passwords.push(`${p.name} (${p.email}): ${p.storedPassword ? 'סיסמה שמורה הועברה' : 'סיסמה לא ידועה — אפשר לאפס למספר הטלפון מתוך המערכת'}${p.phone ? '' : ' · חסר טלפון'}`)
    } else if (SKIP_EMAILS.includes(p.email)) {
      report.passwords.push(`${p.name} (${p.email}): דולג לפי בקשה`)
    } else if (p.phone.length < 6) {
      report.passwords.push(`${p.name} (${p.email}): חסר מספר טלפון — הסיסמה לא שונתה`)
    } else {
      report.passwords.push(`${p.name} (${p.email}): הסיסמה תיקבע למספר הטלפון`)
    }
  }

  report.counts = {
    users: users.length, roles: roles.length, branches: branches.length,
    peopleAfter: people.size, newPeople: newCounter, newRoles: newRoles.length,
    peopleWithPositions: [...people.values()].filter((p) => p.roleIds.size > 0).length,
    rolesWithHolders: new Set([...people.values()].flatMap((p) => [...p.roleIds])).size,
    rolesWithLegacyHolderName: roles.filter((r) => r.holderName).length,
  }

  printReport(report)
  if (REPORT_PATH) writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to perform the migration.')
    return
  }

  const ops = []
  for (const r of newRoles) {
    const { id, isNew: _isNew, newPortalBranchId, ...data } = r
    ops.push((b) => b.set(db.collection('roles').doc(id), { ...data, portalBranchId: newPortalBranchId, createdAt: FieldValue.serverTimestamp() }))
  }
  for (const r of rolesById.values()) {
    if (!r.isNew && r.newPortalBranchId && r.newPortalBranchId !== r.portalBranchId) {
      ops.push((b) => b.update(db.collection('roles').doc(r.id), { portalBranchId: r.newPortalBranchId }))
    }
  }
  for (const p of people.values()) {
    const ref = db.collection('users').doc(p.id)
    const fields = { roleIds: [...p.roleIds], branchIds: p.branchIds }
    if (p.isNew) {
      ops.push((b) => b.set(ref, {
        ...fields, name: p.name, phone: p.phone, email: p.email, role: 'none', active: true,
        createdAt: FieldValue.serverTimestamp(),
      }))
    } else {
      // Access level and name are left exactly as they are.
      if (p.phone !== p.origPhone) fields.phone = p.phone
      if (p.email !== p.origEmail) fields.email = p.email
      ops.push((b) => b.update(ref, fields))
    }
  }
  ops.push(...contactOps, ...secretOps)
  ops.push((b) => b.set(db.collection('meta').doc('peopleMigration'), { appliedAt: FieldValue.serverTimestamp() }))
  await commitInBatches(ops)
  console.log(`\n✓ Applied: ${ops.length} writes.`)

  if (RESET_PASSWORDS) {
    for (const p of staff) {
      if (SKIP_EMAILS.includes(p.email) || p.phone.length < 6) continue
      try {
        await getAuth().updateUser(p.id, { password: p.phone })
        await db.collection('userSecrets').doc(p.id).set({ password: p.phone, setBy: 'migration', setAt: FieldValue.serverTimestamp() })
        console.log(`✓ password = phone: ${p.name}`)
      } catch (err) {
        console.log(`⚠ ${p.name}: ${err.code ?? err.message}`)
      }
    }
  }
}

function printReport(r) {
  const section = (title, list) => {
    console.log(`\n── ${title} (${list.length})`)
    for (const line of list) console.log('   ' + line)
  }
  console.log('=== People migration report ===')
  console.log(r.counts)
  section('שויכו לפי שם זהה', r.matchedByName)
  section('שויכו לפי טלפון + שם חלקי — כדאי לעבור', r.matchedByPhone)
  section('אנשים חדשים שייווצרו (ממלאי תפקיד בלי משתמש) — ללא גישה למערכת', r.createdPeople)
  section('לא שויכו — שם מתאים ליותר מרשומה אחת', r.ambiguous)
  section('שדה "ממלא תפקיד" שנראה כמו כמה אנשים', r.multiNameHolders)
  section('פרטי קשר סותרים בין המאגרים', r.detailConflicts)
  section('תפקיד קיים שקושר לסניף', r.branchLinks)
  section('תפקידי רכז/ת שנוצרו לסניפים בלי תפקיד מקושר', r.genericBranchRoles)
  section('בעיות בקישור רכזים לסניפים', r.branchProblems)
  section('רכזים שיישארו בלי סניף בפורטל', r.coordinatorsWithoutBranch)
  section('ממלאי תפקיד רכז בלי גישה לפורטל (אפשר להעניק במסך האנשים)', r.portalHoldersWithoutAccess)
  section('אנשי קשר כפולים שיימחקו (קיימים במאגר האנשים)', r.contactsRemoved)
  section('אנשי קשר שיועברו ל"בעלי תפקידים לשעבר"', r.contactsToFormer)
  section('אנשי קשר כפולים שנשארים כי משימה מקושרת אליהם', r.contactsKept)
  section('סיסמאות אנשי מטה', r.passwords)
}

await (CLEANUP ? cleanup() : migrate())
process.exit(0)
