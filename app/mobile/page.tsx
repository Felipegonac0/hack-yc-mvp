'use client'

import { useEffect, useRef, useState, useCallback, KeyboardEvent, ReactNode } from 'react'
import { useTTS } from '@/lib/useTTS'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Calculation {
  id: string
  title: string
  formula: string
  steps?: string
  result: string
  unit: string
  table?: Array<Record<string, string>>
}

interface SessionState {
  isActive: boolean
  startTime: string | null
  endTime: string | null
  lastUpdated: string
  reportGenerated: string | null
}

interface LocalMessage {
  role: 'user' | 'agent'
  text: string
  timestamp: Date
  calculations?: Calculation[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(startTime: string | null): string {
  if (!startTime) return '00:00:00'
  const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

function cleanText(t: string) {
  return t
    .replace(/\[CALC\][\s\S]*?\[\/CALC\]/g, '')
    .replace(/\[MAT\][\s\S]*?\[\/MAT\]/g, '')
    .trim()
}

function parseCalcsFromText(text: string): Calculation[] {
  const out: Calculation[] = []
  const re = /\[CALC\]([\s\S]*?)\[\/CALC\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    try { out.push(JSON.parse(m[1].trim())) } catch { /* skip */ }
  }
  return out
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function inlineFormat(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} style={{ color: '#E8F4FD', fontWeight: 700 }}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i}>{p.slice(1, -1)}</em>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} style={{ fontFamily: 'var(--font-jetbrains,monospace)', fontSize: '0.85em', color: '#00A3FF', background: 'rgba(0,163,255,0.12)', padding: '1px 5px', borderRadius: 4 }}>{p.slice(1, -1)}</code>
    return p
  })
}

function renderMarkdown(md: string): ReactNode {
  const lines = md.split('\n')
  const elems: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      elems.push(<div key={i} style={{ fontSize: 13, fontWeight: 700, color: '#00A3FF', marginTop: 10, marginBottom: 2, letterSpacing: '0.04em' }}>{line.slice(3)}</div>)
    } else if (line.startsWith('### ')) {
      elems.push(<div key={i} style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FD', marginTop: 8, marginBottom: 2 }}>{line.slice(4)}</div>)
    } else if (/^[-*] /.test(line)) {
      elems.push(
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: '#00A3FF', flexShrink: 0, marginTop: 1 }}>•</span>
          <span style={{ fontSize: 14, color: '#C8DFF0', lineHeight: 1.55 }}>{inlineFormat(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1] ?? ''
      elems.push(
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: '#00A3FF', flexShrink: 0, fontWeight: 600, minWidth: 16, textAlign: 'right' }}>{num}.</span>
          <span style={{ fontSize: 14, color: '#C8DFF0', lineHeight: 1.55 }}>{inlineFormat(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elems.push(<div key={i} style={{ height: 6 }} />)
    } else {
      elems.push(<p key={i} style={{ fontSize: 14, color: '#C8DFF0', lineHeight: 1.6, margin: '1px 0' }}>{inlineFormat(line)}</p>)
    }
    i++
  }
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{elems}</div>
}

// ─── Sound Wave Indicator ─────────────────────────────────────────────────────

function SoundWave() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14, marginLeft: 4 }}>
      {[0, 0.15, 0.3].map((delay, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, background: '#00A3FF',
          animation: `soundBar 0.9s ${delay}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

// ─── Transcript Bubble ────────────────────────────────────────────────────────

function TranscriptBubble({ msg, isActivelySpeaking }: { msg: LocalMessage; isActivelySpeaking?: boolean }) {
  const isUser = msg.role === 'user'
  const time = msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 8,
        alignItems: 'flex-start',
        animation: 'slideUp 0.22s ease',
      }}
    >
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'linear-gradient(135deg, #0066CC, #00A3FF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#fff', marginTop: 2,
        }}>
          T
        </div>
      )}
      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? '#00A3FF' : '#111D35',
          color: isUser ? '#fff' : '#E8F4FD',
          fontSize: 14, lineHeight: 1.55,
          border: isUser ? 'none' : '1px solid #1E3A5F',
          boxShadow: isUser ? '0 2px 12px rgba(0,163,255,0.3)' : 'none',
        }}>
          {isUser ? msg.text : renderMarkdown(msg.text)}
        </div>
        {!isUser && msg.calculations && msg.calculations.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
            {msg.calculations.map(c => <InlineCalcCard key={c.id} calc={c} />)}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 2px' }}>
          <span style={{ fontSize: 11, color: '#7AA8CC' }}>{time}</span>
          {!isUser && isActivelySpeaking && <SoundWave />}
        </div>
      </div>
    </div>
  )
}

// ─── Inline Calculation Card ──────────────────────────────────────────────────

function InlineCalcCard({ calc }: { calc: Calculation }) {
  const hasTable = calc.table && calc.table.length > 0
  const headers = hasTable ? Object.keys(calc.table![0]) : []

  return (
    <div style={{
      background: '#0D1526', border: '1px solid #00A3FF', borderLeft: '3px solid #00A3FF',
      borderRadius: 12, padding: '14px 16px',
      boxShadow: '0 0 16px rgba(0,163,255,0.12)', animation: 'slideUp 0.3s ease',
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#7AA8CC', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
        Calculation — {calc.title}
      </p>
      <p style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 14, color: '#00A3FF', marginBottom: 6 }}>
        {calc.formula}
      </p>
      {calc.steps && (
        <p style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 12, color: '#7AA8CC', marginBottom: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {calc.steps}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 32, fontWeight: 700, color: '#00D4A8', lineHeight: 1 }}>
          {calc.result}
        </span>
        <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 15, color: '#00D4A8', opacity: 0.8 }}>
          {calc.unit}
        </span>
      </div>
      {hasTable && (
        <div style={{ marginTop: 12, overflowX: 'auto', borderRadius: 8, border: '1px solid #1E3A5F' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
            <thead>
              <tr style={{ background: '#111D35' }}>
                {headers.map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#00A3FF' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.table!.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#0D1526' : '#111D35' }}>
                  {headers.map(h => (
                    <td key={h} style={{ padding: '8px 12px', fontSize: 13, color: '#E8F4FD', fontFamily: 'var(--font-jetbrains, monospace)', borderTop: '1px solid #1E3A5F' }}>
                      {row[h] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', animation: 'slideUp 0.2s ease' }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: 'linear-gradient(135deg, #0066CC, #00A3FF)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 13, fontWeight: 800, color: '#fff',
      }}>T</div>
      <div style={{
        padding: '10px 14px', background: '#111D35', border: '1px solid #1E3A5F',
        borderRadius: '18px 18px 18px 4px', display: 'flex', gap: 5, alignItems: 'center', height: 42,
      }}>
        {[0, 0.18, 0.36].map((d, i) => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: '#00A3FF',
            animation: `dotPulse 1.1s ${d}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div style={{
      position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
      background: '#00D4A8', color: '#060B18', fontSize: 13, fontWeight: 700,
      padding: '12px 20px', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,212,168,0.4)',
      zIndex: 200, maxWidth: 360, textAlign: 'center', animation: 'slideUp 0.3s ease', lineHeight: 1.4,
    }}>
      {message}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MobilePage() {
  const [session, setSession]           = useState<SessionState | null>(null)
  const [connected, setConnected]       = useState(false)
  const [timer, setTimer]               = useState('00:00:00')
  const [messages, setMessages]         = useState<LocalMessage[]>([])
  const [inputText, setInputText]       = useState('')
  const [isLoading, setIsLoading]       = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [isEndingSession, setIsEnding]  = useState(false)
  const [started, setStarted]           = useState(false)
  const startedRef                      = useRef(false)

  const { speak, stop, init, isSpeaking } = useTTS()

  const lastUpdatedRef    = useRef<string | null>(null)
  const sessionHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const transcriptEndRef  = useRef<HTMLDivElement>(null)
  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const sessionInitRef    = useRef(false)

  // ── Poll session state ────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/session/state', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data: SessionState = await res.json()
      setConnected(true)
      if (data.lastUpdated !== lastUpdatedRef.current) {
        lastUpdatedRef.current = data.lastUpdated
        setSession(data)
      }
    } catch {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [poll])

  // ── Session timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => setTimer(formatDuration(session?.startTime ?? null)), 1000)
    return () => clearInterval(id)
  }, [session?.startTime])

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    // Interrupt Thala if she's currently speaking
    stop()

    // Init session on first message
    if (!sessionInitRef.current) {
      sessionInitRef.current = true
      fetch('/api/session/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      }).catch(console.error)
    }

    setInputText('')
    setIsLoading(true)

    const userMsg: LocalMessage = { role: 'user', text: trimmed, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          sessionHistory: sessionHistoryRef.current,
        }),
      })
      const data = await res.json()
      const reply: string = data.reply ?? 'Sorry, I could not process that.'
      const calcs = parseCalcsFromText(reply)

      sessionHistoryRef.current = [
        ...sessionHistoryRef.current,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: reply },
      ]

      const agentMsg: LocalMessage = {
        role: 'agent',
        text: cleanText(reply),
        timestamp: new Date(),
        calculations: calcs.length > 0 ? calcs : undefined,
      }
      setMessages(prev => [...prev, agentMsg])
      if (startedRef.current) speak(reply)
    } catch (e) {
      console.error('[sendMessage]', e)
      setMessages(prev => [...prev, {
        role: 'agent', text: 'Error connecting to Thala. Please try again.', timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
      // Restore focus to textarea
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isLoading, speak, stop])

  // ── End session ───────────────────────────────────────────────────────────

  const handleEndSession = useCallback(async () => {
    if (isEndingSession) return
    setIsEnding(true)
    try {
      await fetch('/api/session/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      setToast('Session ended. Report is generating and will be available on the lab desktop.')
      setTimeout(() => setToast(null), 5000)
      setMessages([])
      sessionHistoryRef.current = []
      sessionInitRef.current = false
    } catch (e) {
      console.error('[handleEndSession]', e)
    } finally {
      setIsEnding(false)
    }
  }, [isEndingSession])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputText)
    }
  }, [inputText, sendMessage])

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    setInputText(el.value)
  }, [])

  const isActive = session?.isActive ?? false
  const canSend = inputText.trim().length > 0 && !isLoading

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 100% { transform: scale(0.7); opacity: 0.4; }
          50%       { transform: scale(1); opacity: 1; }
        }
        @keyframes soundBar {
          0%, 100% { height: 4px; opacity: 0.5; }
          50%       { height: 14px; opacity: 1; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overscroll-behavior: none; }
        ::-webkit-scrollbar { width: 0; }
        textarea::placeholder { color: #3A5A7A; }
      `}</style>

      <div style={{
        maxWidth: 430, margin: '0 auto', height: '100dvh',
        background: '#060B18', fontFamily: 'var(--font-inter, sans-serif)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Tap to begin overlay ──────────────────────────────────────────── */}
        {!started && (
          <div
            onClick={() => { init(); startedRef.current = true; setStarted(true) }}
            style={{
              position: 'absolute', inset: 0, zIndex: 999,
              background: 'rgba(6,11,24,0.97)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00A3FF 0%, #0044AA 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#fff',
              boxShadow: '0 0 40px rgba(0,163,255,0.45)',
            }}>T</div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#E8F4FD', marginBottom: 8 }}>
                Hi, I'm Thala
              </p>
              <p style={{ fontSize: 14, color: '#7AA8CC', lineHeight: 1.7 }}>
                Tap anywhere to begin
              </p>
            </div>
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header style={{
          flexShrink: 0, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          background: 'rgba(6,11,24,0.96)', borderBottom: '1px solid #1E3A5F',
          padding: '12px 20px 10px', zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#E8F4FD' }}>
              Thala
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isActive && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: '#060B18', background: '#00D4A8', padding: '2px 7px', borderRadius: 4,
                }}>
                  Live
                </span>
              )}
              <span style={{ fontSize: 12, color: '#7AA8CC' }}>{connected ? 'Connected' : 'Offline'}</span>
              <span style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                background: connected ? '#00D4A8' : '#FF4D6A',
                boxShadow: connected ? '0 0 8px #00D4A8' : '0 0 8px #FF4D6A',
              }} />
            </div>
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#7AA8CC', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Session</span>
            <span style={{
              fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 14, letterSpacing: '0.04em',
              color: isActive ? '#00D4A8' : '#7AA8CC',
            }}>
              {timer}
            </span>
          </div>
        </header>

        {/* ── Messages ──────────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 16px 8px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {messages.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '60px 24px', textAlign: 'center', gap: 16,
            }}>
              {/* Orb */}
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'linear-gradient(135deg, #00A3FF 0%, #0044AA 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 800, color: '#fff',
                boxShadow: '0 0 28px rgba(0,163,255,0.35)',
              }}>T</div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#E8F4FD', marginBottom: 6 }}>
                  Hi, I'm Thala
                </p>
                <p style={{ fontSize: 13, color: '#7AA8CC', lineHeight: 1.7 }}>
                  Your lab assistant. Type a message below<br />to start your session.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLatestAgent = msg.role === 'agent' && !messages.slice(i + 1).some(m => m.role === 'agent')
            return (
              <TranscriptBubble
                key={i}
                msg={msg}
                isActivelySpeaking={isLatestAgent && isSpeaking}
              />
            )
          })}

          {isLoading && <TypingIndicator />}

          <div ref={transcriptEndRef} />
        </div>

        {/* ── Input bar + End Session ────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, borderTop: '1px solid #1E3A5F',
          background: 'rgba(6,11,24,0.98)', padding: '10px 12px 16px',
        }}>
          {/* Text input row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message Thala…"
              rows={1}
              style={{
                flex: 1, background: '#111D35', border: '1.5px solid #1E3A5F',
                borderRadius: 14, padding: '11px 14px', color: '#E8F4FD',
                fontSize: 15, resize: 'none', outline: 'none',
                fontFamily: 'var(--font-inter, sans-serif)', lineHeight: 1.5,
                maxHeight: 120, overflowY: 'auto',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#00A3FF' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#1E3A5F' }}
            />
            <button
              onClick={() => sendMessage(inputText)}
              disabled={!canSend}
              style={{
                width: 44, height: 44, borderRadius: 12, border: 'none', flexShrink: 0,
                background: canSend ? '#00A3FF' : '#1E3A5F',
                cursor: canSend ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: canSend ? '0 0 16px rgba(0,163,255,0.4)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {isLoading ? (
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                  animation: 'dotPulse 0.8s linear infinite',
                }} />
              ) : (
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>

          {/* End session button — only when active */}
          {isActive && (
            <button
              onClick={handleEndSession}
              disabled={isEndingSession}
              style={{
                width: '100%', marginTop: 8,
                background: 'rgba(255,77,106,0.1)', border: '1.5px solid #FF4D6A',
                borderRadius: 12, padding: '12px', color: '#FF4D6A',
                fontSize: 14, fontWeight: 700,
                cursor: isEndingSession ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', fontFamily: 'var(--font-inter, sans-serif)',
                opacity: isEndingSession ? 0.6 : 1,
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              </svg>
              {isEndingSession ? 'Ending session…' : 'End Session'}
            </button>
          )}
        </div>

        {toast && <Toast message={toast} />}
      </div>
    </>
  )
}
