'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

interface UseSTTOptions {
  onFinalTranscript: (text: string) => void
  onInterimTranscript?: (text: string) => void
  isThalaSpeaking: boolean
}

export function useSTT({
  onFinalTranscript,
  onInterimTranscript,
  isThalaSpeaking
}: UseSTTOptions) {
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const shouldRestartRef = useRef(false)
  const isThalaSpeakingRef = useRef(isThalaSpeaking)

  useEffect(() => { isThalaSpeakingRef.current = isThalaSpeaking }, [isThalaSpeaking])

  const initRecognition = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('Speech recognition not supported. Please use Chrome.')
      return null
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true       // keep listening after each result
    recognition.interimResults = true   // show live preview while speaking
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onend = () => {
      setIsListening(false)
      // Auto-restart if we should still be listening
      // (Web Speech API stops automatically after silence)
      if (shouldRestartRef.current && !isThalaSpeakingRef.current) {
        setTimeout(() => recognition.start(), 300)
      }
    }

    recognition.onerror = (e) => {
      // 'no-speech' is normal — just restart silently
      if (e.error === 'no-speech') return
      if (e.error === 'not-allowed') {
        setError('Microphone access denied. Please allow mic and refresh.')
        shouldRestartRef.current = false
      }
    }

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }

      if (interim) {
        setInterimText(interim)
        onInterimTranscript?.(interim)
      }

      if (final.trim()) {
        setInterimText('')
        onFinalTranscript(final.trim())
      }
    }

    return recognition
  }, [onFinalTranscript, onInterimTranscript])

  const startListening = useCallback(() => {
    if (isThalaSpeakingRef.current) return
    const recognition = initRecognition()
    if (!recognition) return
    recognitionRef.current = recognition
    shouldRestartRef.current = true
    try {
      recognition.start()
    } catch (e) {
      // already started, ignore
    }
  }, [initRecognition])

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false
    recognitionRef.current?.stop()
    setIsListening(false)
    setInterimText('')
  }, [])

  // Pause while Thala speaks, resume when done
  useEffect(() => {
    if (isThalaSpeaking) {
      recognitionRef.current?.stop()
    } else if (shouldRestartRef.current) {
      setTimeout(() => {
        try { recognitionRef.current?.start() } catch (e) {}
      }, 800)
    }
  }, [isThalaSpeaking])

  // Cleanup
  useEffect(() => () => stopListening(), [])

  return { isListening, interimText, error, startListening, stopListening }
}
