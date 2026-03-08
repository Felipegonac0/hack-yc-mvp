import fs from 'fs'
import path from 'path'
import type { Calculation, MaterialUsed } from './session'

export interface SavedTranscriptEntry {
  role: 'user' | 'agent'
  text: string
  timestamp: string
}

export interface SavedConversation {
  id: string
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

const DATA_DIR = path.join(process.cwd(), '.data')
const DATA_FILE = path.join(DATA_DIR, 'conversations.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readAll(): SavedConversation[] {
  try {
    ensureDataDir()
    if (!fs.existsSync(DATA_FILE)) return []
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(raw) as SavedConversation[]
  } catch {
    return []
  }
}

function writeAll(conversations: SavedConversation[]) {
  ensureDataDir()
  fs.writeFileSync(DATA_FILE, JSON.stringify(conversations, null, 2), 'utf-8')
}

export function listConversations(): SavedConversation[] {
  return readAll().sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  )
}

export function saveConversation(data: Omit<SavedConversation, 'id' | 'savedAt' | 'title'>): SavedConversation {
  const all = readAll()
  const firstUserMsg = data.transcript.find(e => e.role === 'user')
  const title = firstUserMsg
    ? String(firstUserMsg.text).slice(0, 60) + (String(firstUserMsg.text).length > 60 ? '…' : '')
    : 'Untitled session'

  const conversation: SavedConversation = {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
    title,
    ...data,
    startTime: data.startTime ? String(data.startTime) : null,
    endTime: data.endTime ? String(data.endTime) : null,
    transcript: data.transcript.map(e => ({
      role: e.role,
      text: e.text,
      timestamp: String(e.timestamp),
    })),
  }

  all.push(conversation)
  writeAll(all)
  return conversation
}

export function deleteConversation(id: string): boolean {
  const all = readAll()
  const filtered = all.filter(c => c.id !== id)
  if (filtered.length === all.length) return false
  writeAll(filtered)
  return true
}
