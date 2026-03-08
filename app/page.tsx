'use client'

import { useEffect, useRef, useState } from 'react'
import { useVoiceAgent } from '@/lib/useVoiceAgent'
import type { SessionState } from '@/lib/session'

function StatusIndicator({ status }: { status: string }) {
  const isActive = status === 'Listening...' || status.startsWith("Listening for")
  const isProcessing = status === 'Processing...'
  const isSpeaking = status === 'Speaking...'

  return (
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-gray-900 border border-gray-800 shadow-lg">
      <span
        className={`w-3 h-3 rounded-full flex-shrink-0 ${
          isSpeaking
            ? 'bg-blue-400 animate-pulse'
            : isProcessing
              ? 'bg-yellow-400 animate-pulse'
              : isActive
                ? 'bg-green-400 animate-pulse'
                : 'bg-gray-600'
        }`}
      />
      <span className="text-sm font-medium text-gray-300">{status}</span>
    </div>
  )
}

export default function Home() {
  const { isListening, isProcessing, isSpeaking, lastTranscript, lastReply, statusMessage, activate, deactivate } =
    useVoiceAgent()

  const [session, setSession] = useState<SessionState | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // SSE: subscribe to session state updates
  useEffect(() => {
    let es: EventSource | null = null

    function connect() {
      es = new EventSource('/api/session')
      es.onmessage = (event) => {
        try {
          setSession(JSON.parse(event.data))
        } catch {
          // ignore
        }
      }
      es.onerror = () => {
        es?.close()
        // Fall back to polling if SSE fails
        setTimeout(pollState, 3000)
      }
    }

    async function pollState() {
      try {
        const res = await fetch('/api/session/state')
        const data = await res.json()
        setSession(data)
      } catch {
        // ignore
      }
      setTimeout(pollState, 5000)
    }

    connect()
    return () => es?.close()
  }, [])

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.transcript])

  return (
    <main className="flex flex-col min-h-screen p-6 gap-6 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Thala</h1>
          <p className="text-xs text-gray-500 mt-0.5">PCR Lab Assistant</p>
        </div>
        <StatusIndicator status={statusMessage} />
      </header>

      {/* Voice Controls */}
      <div className="flex gap-3">
        <button
          onClick={activate}
          disabled={isListening || isProcessing || isSpeaking}
          className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 text-sm font-medium transition-colors"
        >
          Activate
        </button>
        <button
          onClick={deactivate}
          disabled={!isListening && !isProcessing && !isSpeaking}
          className="px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 disabled:opacity-40 text-sm font-medium transition-colors"
        >
          Deactivate
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Transcript */}
        <div className="lg:col-span-2 flex flex-col bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Conversation</h2>
            <span className="text-xs text-gray-600">{session?.transcript?.length ?? 0} messages</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]">
            {(!session?.transcript || session.transcript.length === 0) && (
              <p className="text-gray-600 text-sm text-center mt-8">
                Say <span className="text-green-400 font-medium">&quot;Hey Thala&quot;</span> followed by your question
              </p>
            )}
            {session?.transcript?.map((entry, i) => (
              <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    entry.role === 'user'
                      ? 'bg-blue-700 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                  <p className="text-xs opacity-50 mt-1">
                    {entry.role === 'user' ? 'You' : 'Thala'} ·{' '}
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4">
          {/* Calculations */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Calculations</h2>
              <span className="text-xs text-gray-600">{session?.calculations?.length ?? 0}</span>
            </div>
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {(!session?.calculations || session.calculations.length === 0) && (
                <p className="text-gray-600 text-xs text-center py-4">No calculations yet</p>
              )}
              {session?.calculations?.map((calc, i) => (
                <div key={i} className="bg-gray-800 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-semibold text-cyan-400">{calc.title}</p>
                  <p className="text-xs text-gray-500 font-mono">{calc.formula}</p>
                  {calc.steps && <p className="text-xs text-gray-400">{calc.steps}</p>}
                  <p className="text-sm font-bold text-white">
                    {calc.result}{' '}
                    <span className="text-gray-400 font-normal text-xs">{calc.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Materials */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Materials Used</h2>
              <span className="text-xs text-gray-600">{session?.materialsUsed?.length ?? 0}</span>
            </div>
            <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto">
              {(!session?.materialsUsed || session.materialsUsed.length === 0) && (
                <p className="text-gray-600 text-xs text-center py-4">No materials tracked yet</p>
              )}
              {session?.materialsUsed?.map((mat, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-300">{mat.name}</span>
                  <span className="text-xs font-mono text-emerald-400">{mat.amount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Session info */}
          {session?.isActive && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 px-4 py-3 text-xs text-gray-500 space-y-1">
              <p>
                Started:{' '}
                <span className="text-gray-400">
                  {session.startTime ? new Date(session.startTime).toLocaleTimeString() : '—'}
                </span>
              </p>
              <p>
                Last update:{' '}
                <span className="text-gray-400">{new Date(session.lastUpdated).toLocaleTimeString()}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
