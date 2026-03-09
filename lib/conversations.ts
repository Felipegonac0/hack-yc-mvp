import type { Calculation, MaterialUsed } from './session'

export interface SavedTranscriptEntry {
  role: 'user' | 'agent'
  text: string
  timestamp: string
}

export interface SavedConversation {
  id: string        // "session_1", "session_2", …
  savedAt: string
  title: string
  startTime: string | null
  endTime: string | null
  transcript: SavedTranscriptEntry[]
  calculations: Calculation[]
  materialsUsed: MaterialUsed[]
  protocol: string | null
  reportGenerated: string | null
}

// ── Global cache ──────────────────────────────────────────────────────────────
// Stored on `global` so it survives Next.js hot-module reloads in dev.
// Each conversation is keyed as "session_1", "session_2", etc.

declare global {
  // eslint-disable-next-line no-var
  var __conversationsMap: Map<string, SavedConversation> | undefined
  // eslint-disable-next-line no-var
  var __conversationsCounter: number | undefined
}

function getCache(): Map<string, SavedConversation> {
  if (!global.__conversationsMap) {
    global.__conversationsMap = new Map()
  }
  return global.__conversationsMap
}

function nextCounter(): number {
  global.__conversationsCounter = (global.__conversationsCounter ?? 0) + 1
  return global.__conversationsCounter
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listConversations(): SavedConversation[] {
  return Array.from(getCache().values()).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  )
}

export function saveConversation(
  data: Omit<SavedConversation, 'id' | 'savedAt' | 'title'>
): SavedConversation {
  const firstUserMsg = data.transcript.find(e => e.role === 'user')
  const raw = firstUserMsg?.text ?? ''
  const title = raw.length > 60 ? raw.slice(0, 60) + '…' : raw || 'Untitled session'

  const n = nextCounter()
  const id = `session_${n}`

  const conversation: SavedConversation = {
    id,
    savedAt: new Date().toISOString(),
    title,
    ...data,
  }

  getCache().set(id, conversation)
  return conversation
}

export function deleteConversation(id: string): boolean {
  return getCache().delete(id)
}
