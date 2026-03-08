import { NextRequest, NextResponse } from 'next/server'
import { type SessionState } from '@/lib/session'
import { generateReportFromSession } from '@/lib/generateReport'
import { updateSession } from '@/lib/session'
import { saveConversation } from '@/lib/conversations'

export async function POST(req: NextRequest) {
  try {
    const sessionState = await req.json() as SessionState
    const report = await generateReportFromSession(sessionState)
    updateSession({ reportGenerated: report })

    // Persist session to conversation history
    saveConversation({
      startTime: sessionState.startTime ? String(sessionState.startTime) : null,
      endTime: sessionState.endTime ? String(sessionState.endTime) : null,
      transcript: sessionState.transcript.map(e => ({ role: e.role, text: e.text, timestamp: String(e.timestamp) })),
      calculations: sessionState.calculations,
      materialsUsed: sessionState.materialsUsed,
      protocol: sessionState.protocol,
      reportGenerated: report,
    })

    return NextResponse.json({ report })
  } catch (error) {
    console.error('[/api/generate-report]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
