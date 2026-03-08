'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  ReactNode,
} from 'react'

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

interface MaterialUsed {
  name: string
  amount: string
}

interface TranscriptEntry {
  role: 'user' | 'agent'
  text: string
  timestamp: string
}

interface SessionState {
  isActive: boolean
  startTime: string | null
  endTime: string | null
  transcript: TranscriptEntry[]
  calculations: Calculation[]
  materialsUsed: MaterialUsed[]
  protocol: string | null
  reportGenerated: string | null
  lastUpdated: string
}

type NotebookTab = 'report' | 'metadata' | 'materials'
type AppView = 'live' | 'history'

interface SavedTranscriptEntry {
  role: 'user' | 'agent'
  text: string
  timestamp: string
}

interface SavedConversation {
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:           '#060B18',
  surface:      '#0D1526',
  surface2:     '#111D35',
  border:       '#1E3A5F',
  accent:       '#00A3FF',
  accentSoft:   '#0066CC',
  accentGlow:   'rgba(0,163,255,0.15)',
  textPrimary:  '#E8F4FD',
  textSecondary:'#7AA8CC',
  success:      '#00D4A8',
  warning:      '#FFB547',
  error:        '#FF4D6A',
} as const

// ─── Q5 Protocol data ─────────────────────────────────────────────────────────

const Q5_MATERIALS = [
  'Q5 High-Fidelity 2X Master Mix',
  '10 µM Forward Primer',
  '10 µM Reverse Primer',
  'DNA Template',
  'Nuclease-Free H₂O',
]

const Q5_PROCEDURE = [
  'Add Q5 2X Master Mix to PCR tube.',
  'Add each primer to a final concentration of 500 nM.',
  'Add up to 10 ng template DNA.',
  'Add nuclease-free water to reach the final reaction volume (2× master mix volume).',
  'Gently mix and spin briefly to collect liquid.',
  'Transfer tubes to thermocycler and run program.',
]

const Q5_THERMO = [
  { step: 'Initial Denaturation', temp: '98°C', time: '30 s',    cycles: '1×' },
  { step: 'Denaturation',         temp: '98°C', time: '10 s',    cycles: '25–35×' },
  { step: 'Annealing',            temp: '60°C', time: '20 s',    cycles: '25–35×' },
  { step: 'Extension',            temp: '72°C', time: '25 s/kb', cycles: '25–35×' },
  { step: 'Final Extension',      temp: '72°C', time: '2 min',   cycles: '1×' },
  { step: 'Hold',                 temp: '4°C',  time: '∞',       cycles: '—' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDuration(startTime: string | null, endTime: string | null): string {
  if (!startTime) return '—'
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : new Date()
  const s = Math.floor((end.getTime() - start.getTime()) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function inlineFormat(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} style={{ color: C.textPrimary }}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</em>
    if (p.startsWith('`') && p.endsWith('`'))
      return (
        <code key={i} style={{ fontFamily: 'var(--font-jetbrains,monospace)', color: C.accent, background: C.surface2, padding: '0 3px', borderRadius: 3, fontSize: '0.78em' }}>
          {p.slice(1, -1)}
        </code>
      )
    return p
  })
}

function MdTable({ lines }: { lines: string[] }) {
  const rows = lines.map(l =>
    l.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim())
  )
  const [header, , ...body] = rows
  return (
    <div style={{ overflowX: 'auto', margin: '0.5rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
        <thead>
          <tr>
            {header?.map((h, i) => (
              <th key={i} style={{ padding: '0.3rem 0.6rem', textAlign: 'left', color: C.accent, borderBottom: `1px solid ${C.border}`, fontWeight: 600, background: C.surface2 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? 'rgba(30,58,95,0.2)' : 'transparent' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '0.28rem 0.6rem', color: C.textSecondary, borderBottom: `1px solid rgba(30,58,95,0.25)` }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderMarkdown(md: string): ReactNode {
  const lines = md.split('\n')
  const elems: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      elems.push(<h2 key={i} style={{ color: C.accent, fontSize: '0.9rem', fontWeight: 700, marginTop: '1.1rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elems.push(<h3 key={i} style={{ color: C.textPrimary, fontSize: '0.82rem', fontWeight: 600, marginTop: '0.8rem', marginBottom: '0.2rem' }}>{line.slice(4)}</h3>)
    } else if (line.startsWith('| ')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('| ')) { tableLines.push(lines[i]); i++ }
      elems.push(<MdTable key={`t${i}`} lines={tableLines} />)
      continue
    } else if (line.startsWith('```')) {
      const code: string[] = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      elems.push(<pre key={i} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.6rem', fontFamily: 'var(--font-jetbrains,monospace)', fontSize: '0.72rem', color: C.accent, margin: '0.5rem 0', overflowX: 'auto' }}>{code.join('\n')}</pre>)
    } else if (/^[-*] /.test(line)) {
      elems.push(<li key={i} style={{ color: C.textSecondary, fontSize: '0.78rem', marginLeft: '1rem', marginBottom: '0.12rem', listStyle: 'disc' }}>{inlineFormat(line.slice(2))}</li>)
    } else if (/^\d+\. /.test(line)) {
      elems.push(<li key={i} style={{ color: C.textSecondary, fontSize: '0.78rem', marginLeft: '1rem', marginBottom: '0.12rem', listStyle: 'decimal' }}>{inlineFormat(line.replace(/^\d+\. /, ''))}</li>)
    } else if (line.trim() === '') {
      elems.push(<div key={i} style={{ height: '0.4rem' }} />)
    } else {
      elems.push(<p key={i} style={{ color: C.textSecondary, fontSize: '0.78rem', lineHeight: 1.65, margin: '0.15rem 0' }}>{inlineFormat(line)}</p>)
    }
    i++
  }
  return <div>{elems}</div>
}

// ─── CalcCard ─────────────────────────────────────────────────────────────────

function CalcCard({ calc }: { calc: Calculation }) {
  const hasTable = calc.table && calc.table.length > 0
  const headers = hasTable ? Object.keys(calc.table![0]) : []
  return (
    <div style={{ background: 'rgba(0,163,255,0.05)', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 8, padding: '0.7rem', marginTop: '0.45rem', animation: 'slideUp 0.3s ease' }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: C.textSecondary, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
        ⟨ CALC ⟩ {calc.title}
      </div>
      <div style={{ fontFamily: 'var(--font-jetbrains,monospace)', color: C.accent, fontSize: '0.8rem', marginBottom: calc.steps ? '0.28rem' : '0.4rem', wordBreak: 'break-all' }}>
        {calc.formula}
      </div>
      {calc.steps && (
        <div style={{ color: C.textSecondary, fontSize: '0.7rem', fontStyle: 'italic', marginBottom: '0.4rem' }}>{calc.steps}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
        <span style={{ fontSize: '1.45rem', fontWeight: 800, color: C.textPrimary, fontFamily: 'var(--font-jetbrains,monospace)' }}>{calc.result}</span>
        <span style={{ fontSize: '0.78rem', color: C.textSecondary }}>{calc.unit}</span>
      </div>
      {hasTable && (
        <div style={{ marginTop: '0.45rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
            <thead>
              <tr>{headers.map(h => <th key={h} style={{ padding: '0.22rem 0.45rem', textAlign: 'left', color: C.accent, borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {calc.table!.map((row, i) => (
                <tr key={i} style={{ background: i % 2 ? 'rgba(30,58,95,0.2)' : 'transparent' }}>
                  {headers.map(h => <td key={h} style={{ padding: '0.18rem 0.45rem', color: C.textSecondary }}>{row[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── TranscriptBubble ─────────────────────────────────────────────────────────

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === 'user'
  const displayText = cleanText(entry.text)
  const calcs = entry.role === 'agent' ? parseCalcsFromText(entry.text) : []
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: '0.45rem', alignItems: 'flex-start', animation: 'slideUp 0.25s ease' }}>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${C.accentSoft}, ${C.accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.62rem', fontWeight: 800, color: '#fff', marginTop: '0.1rem' }}>T</div>
      )}
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: '0.2rem' }}>
        <div style={{
          padding: '0.55rem 0.85rem',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? C.accent : C.surface2,
          color: isUser ? '#fff' : C.textPrimary,
          fontSize: '0.82rem',
          lineHeight: 1.6,
          border: isUser ? 'none' : `1px solid ${C.border}`,
          boxShadow: isUser ? '0 2px 14px rgba(0,163,255,0.3)' : 'none',
        }}>
          {isUser ? displayText : renderMarkdown(displayText)}
        </div>
        {calcs.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {calcs.map(c => <CalcCard key={c.id} calc={c} />)}
          </div>
        )}
        <div style={{ fontSize: '0.6rem', color: C.textSecondary, padding: '0 0.2rem' }}>{time}</div>
      </div>
    </div>
  )
}

// ─── SectionBadge ─────────────────────────────────────────────────────────────

function SectionBadge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: '0.1rem 0.42rem', display: 'inline-block' }}>
      {label}
    </span>
  )
}

// ─── ProtocolPanel ────────────────────────────────────────────────────────────

function ProtocolPanel({
  protocol,
  onUploadClick,
  isActive,
}: {
  protocol: string | null
  onUploadClick: () => void
  isActive: boolean
}) {
  const isCustom = protocol !== null
  return (
    <div style={{ width: '24%', minWidth: 240, height: '100vh', background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1.2rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary }}>Protocol</span>
          <span style={{
            fontSize: '0.58rem', fontWeight: 700, padding: '0.1rem 0.42rem', borderRadius: 4,
            background: isCustom ? C.accentGlow : 'rgba(0,212,168,0.1)',
            color: isCustom ? C.accent : C.success,
            border: `1px solid ${isCustom ? 'rgba(0,163,255,0.35)' : 'rgba(0,212,168,0.3)'}`,
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {isCustom ? 'Custom' : 'Base Q5'}
          </span>
        </div>
        {!isActive && (
          <button
            onClick={onUploadClick}
            title="Upload protocol (.txt or .pdf)"
            style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '0.32rem', cursor: 'pointer', color: C.textSecondary, display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem' }}>
        {isCustom ? (
          <div style={{ fontSize: '0.75rem', color: C.textSecondary, lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-jetbrains,monospace)' }}>
            {protocol}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: C.textPrimary, marginBottom: '0.2rem' }}>Q5® High-Fidelity PCR</div>
              <div style={{ fontSize: '0.68rem', color: C.textSecondary }}>NEB M0492 — Standard Protocol</div>
            </div>
            <div>
              <SectionBadge label="Materials" color={C.accent} bg="rgba(0,163,255,0.1)" border="rgba(0,163,255,0.3)" />
              <ul style={{ margin: '0.6rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {Q5_MATERIALS.map((m, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', fontSize: '0.74rem', color: C.textSecondary }}>
                    <span style={{ color: C.accent, flexShrink: 0, marginTop: '0.14rem' }}>•</span>{m}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SectionBadge label="Procedure" color={C.success} bg="rgba(0,212,168,0.08)" border="rgba(0,212,168,0.25)" />
              <ol style={{ margin: '0.6rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {Q5_PROCEDURE.map((step, i) => (
                  <li key={i} style={{ display: 'flex', gap: '0.5rem', paddingLeft: '0.55rem', borderLeft: `2px solid rgba(0,212,168,0.22)`, fontSize: '0.73rem', color: C.textSecondary }}>
                    <span style={{ color: C.success, fontWeight: 700, flexShrink: 0, fontSize: '0.65rem', marginTop: '0.06rem' }}>{String(i + 1).padStart(2, '0')}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <SectionBadge label="Thermocycler" color={C.warning} bg="rgba(255,181,71,0.08)" border="rgba(255,181,71,0.25)" />
              <div style={{ marginTop: '0.6rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                  <thead>
                    <tr style={{ background: C.surface2 }}>
                      {['Step', 'Temp', 'Time', 'Cycles'].map(h => (
                        <th key={h} style={{ padding: '0.3rem 0.45rem', textAlign: 'left', color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.border}`, fontSize: '0.62rem', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Q5_THERMO.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 ? 'rgba(30,58,95,0.14)' : 'transparent' }}>
                        <td style={{ padding: '0.28rem 0.45rem', color: C.textPrimary, fontSize: '0.66rem' }}>{row.step}</td>
                        <td style={{ padding: '0.28rem 0.45rem', color: C.accent, fontFamily: 'var(--font-jetbrains,monospace)', fontWeight: 600 }}>{row.temp}</td>
                        <td style={{ padding: '0.28rem 0.45rem', color: C.textSecondary }}>{row.time}</td>
                        <td style={{ padding: '0.28rem 0.45rem', color: C.textSecondary }}>{row.cycles}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CenterColumn (Transcript) ────────────────────────────────────────────────

function CenterColumn({
  session,
  transcriptEndRef,
}: {
  session: SessionState | null
  transcriptEndRef: React.RefObject<HTMLDivElement>
}) {
  const hasSession = session && (session.isActive || session.transcript.length > 0 || session.reportGenerated)

  return (
    <div style={{ flex: 1, height: '100vh', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '0.9rem 1.2rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary }}>
          Transcript
        </span>
        {session && (
          <span style={{ fontSize: '0.68rem', color: C.textSecondary }}>
            {session.transcript.length} message{session.transcript.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Transcript area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {!hasSession ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', padding: '3rem 2rem', textAlign: 'center', color: C.textSecondary, opacity: 0.5 }}>
            <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <div>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', color: C.textPrimary, opacity: 0.7 }}>
                Waiting for session to start
              </p>
              <p style={{ fontSize: '0.74rem', lineHeight: 1.6 }}>
                Open the mobile interface on your phone<br />
                and say "Hey Thala" to begin.
              </p>
            </div>
          </div>
        ) : session.transcript.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', color: C.textSecondary, opacity: 0.5 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 0.15, 0.3].map((d, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, animation: `dotPulse 1.1s ${d}s ease-in-out infinite` }} />
              ))}
            </div>
            <p style={{ fontSize: '0.78rem' }}>Session active — waiting for conversation…</p>
          </div>
        ) : (
          session.transcript.map((entry, i) => (
            <TranscriptBubble key={i} entry={entry} />
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>
    </div>
  )
}

// ─── NotebookPanel ────────────────────────────────────────────────────────────

function NotebookPanel({
  session,
  activeTab,
  onTabChange,
  onExportPdf,
  onExportDocx,
}: {
  session: SessionState | null
  activeTab: NotebookTab
  onTabChange: (t: NotebookTab) => void
  onExportPdf: () => void
  onExportDocx: () => void
}) {
  const tabs: { id: NotebookTab; label: string }[] = [
    { id: 'report', label: 'Report' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'materials', label: 'Materials' },
  ]

  const report = session?.reportGenerated ?? null
  const calculations = session?.calculations ?? []
  const materials = session?.materialsUsed ?? []

  return (
    <div style={{ width: '24%', minWidth: 240, height: '100vh', background: C.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '0.9rem 1.2rem 0.7rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary, marginBottom: '0.7rem' }}>
          Notebook
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', background: C.surface2, borderRadius: 20, padding: '0.2rem', border: `1px solid ${C.border}` }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                flex: 1, padding: '0.28rem 0.4rem', borderRadius: 16, border: 'none',
                background: activeTab === tab.id ? C.accent : 'transparent',
                color: activeTab === tab.id ? '#fff' : C.textSecondary,
                fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s', fontFamily: 'var(--font-inter,sans-serif)',
                boxShadow: activeTab === tab.id ? '0 0 10px rgba(0,163,255,0.3)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem' }}>
        {activeTab === 'report' && (
          <ReportTab
            report={report}
            isGenerating={!!(session?.isActive === false && !report && session?.endTime)}
            onExportPdf={onExportPdf}
            onExportDocx={onExportDocx}
          />
        )}
        {activeTab === 'metadata' && (
          <MetadataTab session={session} calculations={calculations} />
        )}
        {activeTab === 'materials' && <MaterialsTab materials={materials} />}
      </div>
    </div>
  )
}

function ReportTab({ report, isGenerating, onExportPdf, onExportDocx }: {
  report: string | null; isGenerating: boolean; onExportPdf: () => void; onExportDocx: () => void
}) {
  if (isGenerating) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.9rem', padding: '3rem 1rem', color: C.textSecondary }}>
        <div style={{ width: 38, height: 38, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spinArc 0.75s linear infinite' }} />
        <span style={{ fontSize: '0.78rem' }}>Generating report…</span>
      </div>
    )
  }

  if (!report) {
    return (
      <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem', color: C.textSecondary, textAlign: 'center', marginTop: '0.5rem' }}>
        <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span style={{ fontSize: '0.76rem', lineHeight: 1.6, opacity: 0.65 }}>
          Report will appear here<br />after the session ends on mobile.
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div style={{ display: 'flex', gap: '0.45rem' }}>
        {[
          { label: 'Export PDF', fn: onExportPdf },
          { label: 'Export Word', fn: onExportDocx },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.fn}
            style={{
              flex: 1, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '0.42rem', color: C.textSecondary, fontSize: '0.7rem', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.3rem', transition: 'all 0.2s', fontFamily: 'var(--font-inter,sans-serif)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSecondary }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {btn.label}
          </button>
        ))}
      </div>
      <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '1rem' }}>
        {renderMarkdown(report)}
      </div>
    </div>
  )
}

function MetadataTab({ session, calculations }: { session: SessionState | null; calculations: Calculation[] }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!session?.isActive) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [session?.isActive])

  const duration = formatDuration(session?.startTime ?? null, session?.endTime ?? null)
  const startDate = session?.startTime
    ? new Date(session.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
  const startTime = session?.startTime
    ? new Date(session.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—'

  const cards = [
    {
      label: 'Date', value: startDate, mono: false, accent: false,
      icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    },
    {
      label: 'Start Time', value: startTime, mono: true, accent: false,
      icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    },
    {
      label: 'Duration', value: duration, mono: true, accent: true,
      icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    },
    {
      label: 'Calculations', value: String(calculations.length), mono: true, accent: false,
      icon: <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="12" y2="14" /></svg>,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
      {cards.map((card, i) => (
        <div key={i} style={{
          background: C.surface2, border: `1px solid ${card.accent ? C.accent : C.border}`,
          borderRadius: 10, padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.35rem',
          boxShadow: card.accent ? '0 0 12px rgba(0,163,255,0.1)' : 'none',
        }}>
          <div style={{ color: card.accent ? C.accent : C.textSecondary, opacity: card.accent ? 1 : 0.65 }}>{card.icon}</div>
          <div style={{ fontSize: '0.58rem', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{card.label}</div>
          <div style={{ fontSize: card.value.length > 8 ? '0.72rem' : '0.88rem', fontWeight: 700, color: card.accent ? C.accent : C.textPrimary, fontFamily: card.mono ? 'var(--font-jetbrains,monospace)' : 'inherit' }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function MaterialsTab({ materials }: { materials: MaterialUsed[] }) {
  if (materials.length === 0) {
    return (
      <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 10, padding: '1.5rem 1rem', textAlign: 'center', color: C.textSecondary, fontSize: '0.75rem', opacity: 0.6, marginTop: '0.5rem', lineHeight: 1.6 }}>
        Materials will appear here as Thala identifies them during the session.
      </div>
    )
  }

  const deduped = materials.reduce((acc, mat) => {
    const ex = acc.find(m => m.name === mat.name)
    if (ex) ex.amount = mat.amount
    else acc.push({ ...mat })
    return acc
  }, [] as MaterialUsed[])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {deduped.map((mat, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.5rem 0.7rem', gap: '0.45rem', animation: 'slideUp 0.2s ease' }}>
          <div style={{ fontSize: '0.73rem', color: C.textPrimary, flex: 1 }}>{mat.name}</div>
          <div style={{ fontSize: '0.66rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: 10, background: 'rgba(0,163,255,0.1)', color: C.accent, border: `1px solid rgba(0,163,255,0.25)`, fontFamily: 'var(--font-jetbrains,monospace)', whiteSpace: 'nowrap' }}>
            {mat.amount}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel() {
  const [conversations, setConversations] = useState<SavedConversation[]>([])
  const [selected, setSelected] = useState<SavedConversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyTab, setHistoryTab] = useState<NotebookTab>('report')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (!res.ok) throw new Error('Failed to load')
      const data: SavedConversation[] = await res.json()
      setConversations(data)
      if (selected) {
        const updated = data.find(c => c.id === selected.id)
        setSelected(updated ?? null)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(id)
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch {
      // ignore
    } finally {
      setDeleting(null)
    }
  }, [selected])

  const historyTabs: { id: NotebookTab; label: string }[] = [
    { id: 'report', label: 'Report' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'materials', label: 'Materials' },
  ]

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: conversation list */}
      <div style={{ width: 280, minWidth: 220, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.surface, overflow: 'hidden' }}>
        <div style={{ padding: '0.9rem 1.2rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary }}>
            Saved Sessions
          </span>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.62rem', color: C.textSecondary, fontFamily: 'var(--font-jetbrains,monospace)' }}>
            {conversations.length}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: C.textSecondary, fontSize: '0.74rem', opacity: 0.6 }}>Loading…</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '2rem 1.2rem', textAlign: 'center', color: C.textSecondary, fontSize: '0.74rem', lineHeight: 1.65, opacity: 0.6 }}>
              No saved sessions yet.<br />Sessions are saved automatically when a report is generated.
            </div>
          ) : (
            conversations.map(conv => {
              const isSelected = selected?.id === conv.id
              const date = new Date(conv.savedAt)
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
              return (
                <div
                  key={conv.id}
                  onClick={() => { setSelected(conv); setHistoryTab('report') }}
                  style={{
                    padding: '0.7rem 1.2rem',
                    cursor: 'pointer',
                    borderLeft: `3px solid ${isSelected ? C.accent : 'transparent'}`,
                    background: isSelected ? C.accentGlow : 'transparent',
                    transition: 'all 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(30,58,95,0.3)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontSize: '0.74rem', color: isSelected ? C.textPrimary : C.textSecondary, fontWeight: isSelected ? 600 : 400, lineHeight: 1.4, paddingRight: '1.4rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {conv.title}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: C.textSecondary, opacity: 0.7 }}>
                    {dateStr} · {timeStr}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: C.textSecondary, opacity: 0.55 }}>
                    {conv.transcript.length} messages · {conv.calculations.length} calcs
                  </div>
                  <button
                    onClick={e => handleDelete(conv.id, e)}
                    disabled={deleting === conv.id}
                    style={{
                      position: 'absolute', top: '0.55rem', right: '0.7rem',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: C.textSecondary, padding: '0.2rem', borderRadius: 4,
                      opacity: deleting === conv.id ? 0.4 : 0.5,
                      transition: 'all 0.15s', display: 'flex', alignItems: 'center',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.error; e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.textSecondary; e.currentTarget.style.opacity = '0.5' }}
                    title="Delete session"
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Center: transcript */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '0.9rem 1.2rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary }}>Transcript</span>
          {selected && (
            <span style={{ fontSize: '0.68rem', color: C.textSecondary }}>{selected.transcript.length} messages</span>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, opacity: 0.4, gap: '0.6rem' }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span style={{ fontSize: '0.78rem' }}>Select a session to view</span>
            </div>
          ) : selected.transcript.length === 0 ? (
            <div style={{ color: C.textSecondary, fontSize: '0.76rem', opacity: 0.5, padding: '2rem', textAlign: 'center' }}>No transcript available</div>
          ) : (
            selected.transcript.map((entry, i) => <TranscriptBubble key={i} entry={entry} />)
          )}
        </div>
      </div>

      {/* Right: notebook */}
      <div style={{ width: '24%', minWidth: 240, background: C.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0.9rem 1.2rem 0.7rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary, marginBottom: '0.7rem' }}>Notebook</div>
          <div style={{ display: 'flex', gap: '0.25rem', background: C.surface2, borderRadius: 20, padding: '0.2rem', border: `1px solid ${C.border}` }}>
            {historyTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setHistoryTab(tab.id)}
                style={{
                  flex: 1, padding: '0.28rem 0.4rem', borderRadius: 16, border: 'none',
                  background: historyTab === tab.id ? C.accent : 'transparent',
                  color: historyTab === tab.id ? '#fff' : C.textSecondary,
                  fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s', fontFamily: 'var(--font-inter,sans-serif)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem' }}>
          {!selected ? (
            <div style={{ color: C.textSecondary, fontSize: '0.74rem', opacity: 0.45, textAlign: 'center', marginTop: '2rem' }}>Select a session</div>
          ) : historyTab === 'report' ? (
            <ReportTab report={selected.reportGenerated} isGenerating={false} onExportPdf={() => {}} onExportDocx={() => {}} />
          ) : historyTab === 'metadata' ? (
            <MetadataTab
              session={selected ? { ...selected, isActive: false, lastUpdated: selected.savedAt } as unknown as SessionState : null}
              calculations={selected?.calculations ?? []}
            />
          ) : (
            <MaterialsTab materials={selected?.materialsUsed ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LabPage() {
  const [appView, setAppView] = useState<AppView>('live')
  const [session, setSession] = useState<SessionState | null>(null)
  const [connected, setConnected] = useState(false)
  const [activeTab, setActiveTab] = useState<NotebookTab>('metadata')

  const lastUpdatedRef = useRef<string | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevReportRef = useRef<string | null>(null)

  // ── Polling ────────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/session/state', { cache: 'no-store' })
      if (!res.ok) throw new Error('bad response')
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

  // ── Auto-switch to Report tab when report is generated ─────────────────────

  useEffect(() => {
    if (session?.reportGenerated && session.reportGenerated !== prevReportRef.current) {
      prevReportRef.current = session.reportGenerated
      setActiveTab('report')
    }
  }, [session?.reportGenerated])

  // ── Auto-scroll transcript ─────────────────────────────────────────────────

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.transcript?.length])

  // ── Protocol upload ────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await fetch('/api/session/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol: text }),
    })
    poll()
  }, [poll])

  // ── Export handlers ────────────────────────────────────────────────────────

  const handleExport = useCallback(async (format: 'pdf' | 'docx') => {
    try {
      const report = session?.reportGenerated
      if (!report) return
      const res = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: report }),
      })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)

      if (format === 'pdf') {
        // PDF route returns HTML with window.print() — open in new tab
        const html = await res.text()
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `lab-report.${format}`; a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      console.error('[handleExport]', e)
    }
  }, [session?.reportGenerated])

  const isActive = session?.isActive ?? false

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spinArc {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes dotPulse {
          0%, 100% { transform: scale(0.7); opacity: 0.4; }
          50%       { transform: scale(1); opacity: 1; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: 'var(--font-inter,sans-serif)', overflow: 'hidden', flexDirection: 'column' }}>

        {/* ── Top nav bar ──────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: C.surface, display: 'flex', alignItems: 'center', padding: '0 1.2rem', gap: '0.25rem', height: 42, zIndex: 20 }}>
          {/* Logo / wordmark */}
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: '1rem' }}>Thala Lab</div>

          {/* View tabs */}
          {(['live', 'history'] as AppView[]).map(view => (
            <button
              key={view}
              onClick={() => setAppView(view)}
              style={{
                padding: '0.28rem 0.85rem', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: appView === view ? C.accentGlow : 'transparent',
                color: appView === view ? C.accent : C.textSecondary,
                fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'capitalize',
                fontFamily: 'var(--font-inter,sans-serif)',
                transition: 'all 0.18s',
                outline: appView === view ? `1px solid rgba(0,163,255,0.35)` : 'none',
              }}
            >
              {view === 'live' ? 'Live Session' : 'History'}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Live session status indicators */}
          {appView === 'live' && isActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#00D4A8', boxShadow: '0 0 6px #00D4A8', animation: 'livePulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#00D4A8', letterSpacing: '0.06em' }}>Live</span>
              <span style={{ fontSize: '0.65rem', color: 'rgba(0,212,168,0.6)' }}>— session on mobile</span>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: connected ? '#00D4A8' : C.error, boxShadow: `0 0 5px ${connected ? '#00D4A8' : C.error}`, marginLeft: 8 }} />
              <span style={{ fontSize: '0.63rem', color: C.textSecondary }}>{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          )}
        </div>

        {/* ── Content area ─────────────────────────────────────────────────── */}
        {appView === 'history' ? (
          <HistoryPanel />
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept=".txt,.pdf" style={{ display: 'none' }} onChange={handleFileUpload} />

            {/* LEFT — Protocol */}
            <ProtocolPanel
              protocol={session?.protocol ?? null}
              onUploadClick={() => fileInputRef.current?.click()}
              isActive={isActive}
            />

            {/* CENTER — Transcript */}
            <CenterColumn session={session} transcriptEndRef={transcriptEndRef} />

            {/* RIGHT — Notebook */}
            <NotebookPanel
              session={session}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onExportPdf={() => handleExport('pdf')}
              onExportDocx={() => handleExport('docx')}
            />
          </div>
        )}
      </div>
    </>
  )
}
