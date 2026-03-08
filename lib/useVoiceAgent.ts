'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
}

interface UseVoiceAgentReturn {
  isListening: boolean
  isProcessing: boolean
  isSpeaking: boolean
  lastTranscript: string
  lastReply: string
  statusMessage: string
  activate: () => void
  deactivate: () => void
}

const WAKE_WORDS = ['hey thala', 'hey tala']
const SILENCE_TIMEOUT_MS = 2000

function isWakeWord(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return WAKE_WORDS.some((w) => lower.includes(w))
}

function stripWakeWord(text: string): string {
  let result = text.toLowerCase().trim()
  for (const w of WAKE_WORDS) {
    result = result.replace(w, '').trim()
  }
  return result
}

export function useVoiceAgent(): UseVoiceAgentReturn {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastTranscript, setLastTranscript] = useState('')
  const [lastReply, setLastReply] = useState('')
  const [statusMessage, setStatusMessage] = useState("Listening for 'Hey Thala'...")

  const recognitionRef    = useRef<SpeechRecognition | null>(null)
  const sessionHistoryRef = useRef<TranscriptMessage[]>([])
  const awaitingCommandRef = useRef(false)
  const commandBufferRef  = useRef('')
  const silenceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef         = useRef(false)
  // Ref mirror of isProcessing — avoids stale closures inside recognition handlers
  const isProcessingRef   = useRef(false)
  // Ref to the latest startRecognition so onend can always call the fresh version
  const startRecognitionRef = useRef<() => void>(() => {})

  // ── TTS ──────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find((v) => v.lang.startsWith('en-US')) ?? voices[0]
      if (preferred) utter.voice = preferred
      utter.lang = 'en-US'
      utter.rate = 1.05
      utter.onstart = () => setIsSpeaking(true)
      utter.onend = () => { setIsSpeaking(false); resolve() }
      utter.onerror = () => { setIsSpeaking(false); resolve() }
      window.speechSynthesis.speak(utter)
    })
  }, [])

  // ── Chat ─────────────────────────────────────────────────────────────────

  const sendToChat = useCallback(
    async (message: string) => {
      setIsProcessing(true)
      isProcessingRef.current = true
      setStatusMessage('Processing...')
      setLastTranscript(message)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, sessionHistory: sessionHistoryRef.current }),
        })
        const data = await res.json()
        const reply: string = data.reply ?? 'Sorry, I could not process that.'
        setLastReply(reply)

        sessionHistoryRef.current = [
          ...sessionHistoryRef.current,
          { role: 'user', content: message },
          { role: 'assistant', content: reply },
        ]

        setStatusMessage('Speaking...')
        await speak(reply)
      } catch (err) {
        console.error('[useVoiceAgent] chat error', err)
        await speak('An error occurred. Please try again.')
      } finally {
        setIsProcessing(false)
        isProcessingRef.current = false
        if (activeRef.current) {
          setStatusMessage("Listening for 'Hey Thala'...")
          // Resume listening after speaking
          startRecognitionRef.current()
        }
      }
    },
    [speak],
  )

  // ── Silence timer ────────────────────────────────────────────────────────

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(async () => {
      const command = commandBufferRef.current.trim()
      commandBufferRef.current = ''
      awaitingCommandRef.current = false

      // Even if command is empty (user just said "Hey Thala"), send a greeting
      // so Thala responds with the first-response protocol check
      await sendToChat(command || 'Hello')
    }, SILENCE_TIMEOUT_MS)
  }, [sendToChat])

  // ── Recognition — always creates a fresh instance ─────────────────────

  const startRecognition = useCallback(() => {
    if (!activeRef.current) return

    // Stop any existing instance first
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      setStatusMessage('Speech recognition not supported in this browser.')
      return
    }

    const rec = new SR()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = ''
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }

      const newText = (finalText || interimText).trim()
      if (!newText) return

      if (!awaitingCommandRef.current) {
        if (isWakeWord(newText)) {
          awaitingCommandRef.current = true
          commandBufferRef.current = stripWakeWord(newText)
          setStatusMessage('Listening...')
          resetSilenceTimer()
        }
      } else {
        if (finalText) {
          commandBufferRef.current += ' ' + finalText
          resetSilenceTimer()
        } else if (interimText) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(async () => {
            const command = commandBufferRef.current.trim()
            commandBufferRef.current = ''
            awaitingCommandRef.current = false
            await sendToChat(command || 'Hello')
          }, SILENCE_TIMEOUT_MS)
        }
      }
    }

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.error('[useVoiceAgent] recognition error', event.error)
      if (event.error === 'not-allowed') {
        setStatusMessage('Microphone access denied.')
        activeRef.current = false
        setIsListening(false)
      }
    }

    // On end: always create a fresh instance — never reuse the dead one
    rec.onend = () => {
      if (activeRef.current && !isProcessingRef.current) {
        // Small delay to avoid tight restart loops on mobile
        setTimeout(() => startRecognitionRef.current(), 250)
      }
    }

    recognitionRef.current = rec
    try {
      rec.start()
    } catch (err) {
      console.error('[useVoiceAgent] start error', err)
    }
  }, [resetSilenceTimer, sendToChat])

  // Keep ref in sync with latest startRecognition
  useEffect(() => {
    startRecognitionRef.current = startRecognition
  }, [startRecognition])

  // ── Public API ────────────────────────────────────────────────────────────

  const activate = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    setIsListening(true)
    setStatusMessage("Listening for 'Hey Thala'...")
    startRecognition()
  }, [startRecognition])

  const deactivate = useCallback(() => {
    activeRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    setIsListening(false)
    setIsProcessing(false)
    isProcessingRef.current = false
    setStatusMessage('Deactivated')
  }, [])

  // Cleanup on unmount only — activation is triggered explicitly by the UI
  useEffect(() => {
    return () => { deactivate() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { isListening, isProcessing, isSpeaking, lastTranscript, lastReply, statusMessage, activate, deactivate }
}
