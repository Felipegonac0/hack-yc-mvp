'use client'
import { useRef, useState, useCallback } from 'react'

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)

  // Call once inside a user-gesture handler (e.g. "Tap to begin") to satisfy
  // browser autoplay policy before the first async speak() call.
  const init = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext()
    }
  }, [])

  const speak = useCallback(async (text: string) => {
    // Strip [CALC]...[/CALC] → verbal description; strip [MAT]...[/MAT] silently
    const cleanText = text
      .replace(/\[CALC\][\s\S]*?\[\/CALC\]/g, `I've calculated the results — check the table on your screen.`)
      .replace(/\[MAT\][\s\S]*?\[\/MAT\]/g, '')
      .trim()

    if (!cleanText) return

    // Interrupt any currently playing audio
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop() } catch { /* ignore */ }
      currentSourceRef.current = null
    }

    setIsSpeaking(true)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`TTS route failed: ${errText}`)
      }

      // Reuse pre-warmed context if available; create one as fallback
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AC()
      }
      const audioContext = audioContextRef.current

      // Resume if suspended (some browsers suspend until a gesture)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Collect the full response before decoding — partial MP3 chunks
      // cannot be reliably decoded by decodeAudioData.
      const arrayBuffer = await response.arrayBuffer()
      console.log('[TTS] received', arrayBuffer.byteLength, 'bytes')
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      console.log('[TTS] decoded, duration', audioBuffer.duration, 's')

      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start()
      currentSourceRef.current = source
      source.onended = () => {
        currentSourceRef.current = null
        setIsSpeaking(false)
      }
    } catch (err) {
      console.error('[TTS] failed, falling back to speechSynthesis:', err)
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.lang = 'en-US'
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    }
  }, [])

  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop() } catch { /* ignore */ }
      currentSourceRef.current = null
    }
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  return { speak, stop, init, isSpeaking }
}
