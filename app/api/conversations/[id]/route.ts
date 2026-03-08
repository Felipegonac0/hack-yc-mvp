import { NextRequest, NextResponse } from 'next/server'
import { deleteConversation } from '@/lib/conversations'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = deleteConversation(params.id)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
