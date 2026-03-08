import { NextRequest, NextResponse } from 'next/server'
import { listConversations, saveConversation } from '@/lib/conversations'

export async function GET() {
  const conversations = listConversations()
  return NextResponse.json(conversations)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const saved = saveConversation(body)
    return NextResponse.json(saved, { status: 201 })
  } catch (error) {
    console.error('[POST /api/conversations]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
