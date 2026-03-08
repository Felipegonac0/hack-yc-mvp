import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession, type SessionState } from '@/lib/session'
import { generateAndSaveReport } from '@/lib/generateReport'

export async function POST(req: NextRequest) {
  try {
    const partial = (await req.json()) as Partial<SessionState>
    const current = getSession()

    // When activating session for first time, set startTime
    if (partial.isActive === true && !current.startTime) {
      partial.startTime = new Date()
      partial.endTime = null
    }

    // When deactivating session, set endTime and trigger report generation
    if (partial.isActive === false && current.isActive) {
      partial.endTime = new Date()
      updateSession(partial)
      // Fire-and-forget report generation
      generateAndSaveReport().catch(err => console.error('[session/update] report generation error', err))
      return NextResponse.json({ ok: true })
    }

    updateSession(partial)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/session/update]', error)
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
}
