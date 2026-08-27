import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { normalizePhone } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const { token, responses } = await req.json()

    if (!token || !responses) {
      return NextResponse.json({ error: 'Missing token or responses' }, { status: 400 })
    }

    // Find form by token (server-side, can read inactive forms too for safety — but we check isActive)
    const formsSnap = await adminDb
      .collection('forms')
      .where('publicToken', '==', token)
      .where('isActive', '==', true)
      .limit(1)
      .get()

    if (formsSnap.empty) {
      return NextResponse.json({ error: 'Form not found or inactive' }, { status: 404 })
    }

    const formDoc = formsSnap.docs[0]
    const formId = formDoc.id

    // Try to match existing profile by phone or email from responses
    const allValues = Object.values(responses).flat().map(String)

    // Look for phone-like and email-like values in responses
    const phoneValues = allValues.filter(v => /^0[0-9]{8,9}$/.test(v.replace(/[-\s]/g, '')))
    const emailValues = allValues.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))

    let profileId: string | undefined
    let isNewProfile = false

    if (phoneValues.length > 0) {
      const normalized = normalizePhone(phoneValues[0])
      const snap = await adminDb
        .collection('profiles')
        .where('phone', '==', normalized)
        .limit(1)
        .get()
      if (!snap.empty) profileId = snap.docs[0].id
    }

    if (!profileId && emailValues.length > 0) {
      const snap = await adminDb
        .collection('profiles')
        .where('email', '==', emailValues[0].toLowerCase())
        .limit(1)
        .get()
      if (!snap.empty) profileId = snap.docs[0].id
    }

    // Create a minimal profile if no match
    if (!profileId) {
      isNewProfile = true
      const newRef = adminDb.collection('profiles').doc()
      const id = `USR-${newRef.id.slice(0, 5).toUpperCase()}`
      await newRef.set({
        id,
        firstName: '—',
        lastName: '—',
        phone: phoneValues[0] ? normalizePhone(phoneValues[0]) : undefined,
        email: emailValues[0]?.toLowerCase() ?? undefined,
        communityStatus: 'מתמיין',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: 'form_submission',
      })
      profileId = newRef.id
    }

    // Write submission
    const subRef = adminDb.collection('forms').doc(formId).collection('submissions').doc()
    await subRef.set({
      id: subRef.id,
      formId,
      profileId,
      isNewProfile,
      responses,
      submittedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true, profileId, isNewProfile })
  } catch (err) {
    console.error('Form submit error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
