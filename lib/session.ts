export interface Calculation {
  id: string
  title: string
  formula: string
  steps?: string
  result: string
  unit: string
  table?: Array<Record<string, string>>
}

export interface TranscriptEntry {
  role: 'user' | 'agent'
  text: string
  timestamp: Date
}

export interface MaterialUsed {
  name: string
  amount: string
}

export interface SessionState {
  isActive: boolean
  startTime: Date | null
  endTime: Date | null
  transcript: TranscriptEntry[]
  calculations: Calculation[]
  materialsUsed: MaterialUsed[]
  protocol: string | null
  reportGenerated: string | null
  lastUpdated: Date
}

const defaultState = (): SessionState => ({
  isActive: false,
  startTime: null,
  endTime: null,
  transcript: [],
  calculations: [],
  materialsUsed: [],
  protocol: null,
  reportGenerated: null,
  lastUpdated: new Date(),
})

// Module-level singleton — survives across requests in the same Node.js process
let sessionState: SessionState = defaultState()

// SSE subscriber registry
type Subscriber = (state: SessionState) => void
const subscribers = new Set<Subscriber>()

export function getSession(): SessionState {
  return sessionState
}

export function updateSession(partial: Partial<SessionState>): void {
  sessionState = {
    ...sessionState,
    ...partial,
    lastUpdated: new Date(),
  }
  // Notify all SSE subscribers
  for (const cb of Array.from(subscribers)) {
    try {
      cb(sessionState)
    } catch {
      // subscriber may have disconnected; safe to ignore
    }
  }
}

export function resetSession(): void {
  sessionState = defaultState()
  for (const cb of Array.from(subscribers)) {
    try {
      cb(sessionState)
    } catch {
      // ignore
    }
  }
}

export function subscribeToSession(cb: Subscriber): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}
