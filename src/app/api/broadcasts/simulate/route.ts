import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const { channel, segmentId, segmentName, templateBody, recipientCount } = await req.json()

    if (!channel || !templateBody) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get current user from Authorization header (simplified — use uid claim in production)
    const uid = req.headers.get('x-uid') ?? 'system'

    const broadcastRef = adminDb.collection('broadcasts').doc()
    await broadcastRef.set({
      id: broadcastRef.id,
      channel,
      segmentId: segmentId || null,
      segmentName: segmentName || null,
      recipientCount: recipientCount ?? 0,
      templateBody,
      status: 'simulated',
      dispatchedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    })

    return NextResponse.json({ ok: true, id: broadcastRef.id })
  } catch (err) {
    console.error('Broadcast simulate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
