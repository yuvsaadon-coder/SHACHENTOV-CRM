import type { Handler } from '@netlify/functions'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { corsHeaders, handleOptions } from './_cors'

/**
 * Public endpoint for the volunteer self-service page.
 * No Firebase Auth — authentication is a long random token in the URL.
 *
 * GET  ?token=xxx          → returns volunteer + branch + shifts + assignments
 * POST {token, action: 'commit',  shiftIds: string[]}  → sign up
 * POST {token, action: 'cancel',  shiftId: string}     → cancel (≥12h before)
 * POST {token, action: 'decline'}                      → "can't this month"
 */

const CANCEL_HOURS = 12   // volunteer can cancel up until this many hours before

function initFirebase() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT')
  initializeApp({ credential: cert(JSON.parse(raw) as Record<string, string>) })
}

const json = (cors: Record<string, string>, status: number, body: unknown) => ({
  statusCode: status,
  headers: { ...cors, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  const origin = event.headers['origin']
  const cors = corsHeaders(origin)
  if (event.httpMethod === 'OPTIONS') return handleOptions(origin)

  try { initFirebase() } catch {
    return json(cors, 500, { error: 'Server misconfiguration.' })
  }

  const db = getFirestore()

  // ── Resolve token ──
  const token =
    event.httpMethod === 'GET'
      ? (event.queryStringParameters?.token ?? '')
      : (JSON.parse(event.body ?? '{}') as { token?: string }).token ?? ''

  if (!token) return json(cors, 400, { error: 'חסר טוקן.' })

  const tokenDoc = await db.collection('volunteer_tokens').doc(token).get()
  if (!tokenDoc.exists || tokenDoc.data()?.active === false) {
    return json(cors, 404, { error: 'הקישור אינו תקף. בקש/י קישור חדש מהרכז.' })
  }
  const { volunteerId, branchId } = tokenDoc.data() as { volunteerId: string; branchId: string }

  // ── GET: return page data ──
  if (event.httpMethod === 'GET') {
    const [volSnap, branchSnap] = await Promise.all([
      db.collection('volunteers').doc(volunteerId).get(),
      db.collection('branches').doc(branchId).get(),
    ])
    if (!volSnap.exists) return json(cors, 404, { error: 'המתנדב לא נמצא.' })

    const vol = volSnap.data()!
    const branch = branchSnap.data() ?? {}

    // Current + next month shifts
    const now = new Date()
    const months = [
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`,
    ]

    const shiftsSnap = await db.collection('shifts')
      .where('branchId', '==', branchId)
      .where('month', 'in', months)
      .where('status', '!=', 'cancelled')
      .orderBy('status')
      .orderBy('date')
      .get()

    const shifts = shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    // Counts of committed assignments per shift
    const shiftIds = shifts.map((s) => (s as { id: string }).id)
    const assignmentsSnap = shiftIds.length > 0
      ? await db.collection('assignments')
          .where('shiftId', 'in', shiftIds.slice(0, 30))
          .where('status', '==', 'committed')
          .get()
      : { docs: [] }

    const countByShift: Record<string, number> = {}
    const myAssignments: string[] = []
    for (const a of assignmentsSnap.docs) {
      const d = a.data()
      countByShift[d.shiftId] = (countByShift[d.shiftId] ?? 0) + 1
      if (d.volunteerId === volunteerId) myAssignments.push(d.shiftId)
    }

    const shiftsWithCount = shifts.map((s: Record<string, unknown>) => ({
      ...s,
      committed: countByShift[(s.id as string)] ?? 0,
      isMine: myAssignments.includes(s.id as string),
    }))

    return json(cors, 200, {
      volunteer: { id: volunteerId, name: vol.name },
      branch: { id: branchId, name: branch.name ?? '' },
      shifts: shiftsWithCount,
    })
  }

  // ── POST ──
  if (event.httpMethod !== 'POST') return json(cors, 405, { error: 'Method not allowed.' })

  const body = JSON.parse(event.body ?? '{}') as {
    token: string
    action: 'commit' | 'cancel' | 'decline'
    shiftIds?: string[]
    shiftId?: string
  }

  // ── action: commit ──
  if (body.action === 'commit') {
    const shiftIds = body.shiftIds ?? []
    if (!shiftIds.length) return json(cors, 400, { error: 'לא נבחרו חלוקות.' })

    // Load shifts to validate capacity
    const shiftDocs = await Promise.all(
      shiftIds.map((id) => db.collection('shifts').doc(id).get())
    )

    const errors: string[] = []
    for (const snap of shiftDocs) {
      if (!snap.exists || snap.data()?.branchId !== branchId) {
        errors.push(`חלוקה ${snap.id} לא תקפה לסניף זה.`)
        continue
      }
    }
    if (errors.length) return json(cors, 400, { error: errors.join(' ') })

    // For each shift: transactional sign-up (enforce capacity)
    for (const snap of shiftDocs) {
      const shiftData = snap.data()!
      const assignId = `${snap.id}_${volunteerId}`

      await db.runTransaction(async (tx) => {
        const existing = await tx.get(db.collection('assignments').doc(assignId))
        if (existing.exists && existing.data()?.status === 'committed') return

        // Count current committed
        const countSnap = await db.collection('assignments')
          .where('shiftId', '==', snap.id)
          .where('status', '==', 'committed')
          .get()

        if (countSnap.size >= shiftData.capacity) {
          throw new Error(`החלוקה ב-${shiftData.date} מלאה.`)
        }

        tx.set(db.collection('assignments').doc(assignId), {
          shiftId: snap.id,
          volunteerId,
          branchId,
          month: shiftData.month,
          status: 'committed',
          source: 'self',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      })
    }

    // Mark monthly response as answered
    const month = shiftDocs[0].data()?.month ?? ''
    if (month) {
      const responseId = `${branchId}_${month}_${volunteerId}`
      await db.collection('monthly_responses').doc(responseId).set({
        branchId, month, volunteerId, status: 'answered',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }

    return json(cors, 200, { committed: shiftIds })
  }

  // ── action: cancel ──
  if (body.action === 'cancel') {
    const shiftId = body.shiftId
    if (!shiftId) return json(cors, 400, { error: 'חסר מזהה חלוקה.' })

    const shiftSnap = await db.collection('shifts').doc(shiftId).get()
    if (!shiftSnap.exists) return json(cors, 404, { error: 'החלוקה לא נמצאה.' })

    // Enforce 12-hour cancellation window
    const shiftData = shiftSnap.data()!
    const shiftDateTime = new Date(`${shiftData.date}T${shiftData.startTime}:00`)
    const hoursUntil = (shiftDateTime.getTime() - Date.now()) / 36e5
    if (hoursUntil < CANCEL_HOURS) {
      return json(cors, 400, {
        error: `ביטול אפשרי עד ${CANCEL_HOURS} שעות לפני החלוקה. אנא פנה/י לרכז ישירות.`,
        lateCancel: true,
      })
    }

    const assignId = `${shiftId}_${volunteerId}`
    await db.collection('assignments').doc(assignId).update({
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return json(cors, 200, { cancelled: shiftId })
  }

  // ── action: decline ──
  if (body.action === 'decline') {
    // Find current month
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const responseId = `${branchId}_${month}_${volunteerId}`
    await db.collection('monthly_responses').doc(responseId).set({
      branchId, month, volunteerId, status: 'declined',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return json(cors, 200, { declined: true })
  }

  return json(cors, 400, { error: 'פעולה לא מוכרת.' })
}
