import { NextRequest, NextResponse } from 'next/server'
import { type SessionState } from '@/lib/session'
import { generateReportFromSession } from '@/lib/generateReport'
import { updateSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const sessionState = await req.json() as SessionState
    const report = await generateReportFromSession(sessionState)
    updateSession({ reportGenerated: report })
    return NextResponse.json({ report })
  } catch (error) {
    console.error('[/api/generate-report]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
