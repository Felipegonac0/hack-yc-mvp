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

      if (!response.ok) throw new Error('TTS failed')

      // Reuse pre-warmed context if available; create one as fallback
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext()
      }
      const audioContext = audioContextRef.current

      // Resume if suspended (some browsers suspend until a gesture)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const reader = response.body!.getReader()
      let buffer = new Uint8Array(0)
      const CHUNK_SIZE = 32768
      let nextStartTime = audioContext.currentTime
      let lastSource: AudioBufferSourceNode | null = null

      const scheduleChunk = async (chunk: Uint8Array) => {
        const merged = new Uint8Array(buffer.length + chunk.length)
        merged.set(buffer)
        merged.set(chunk, buffer.length)
        buffer = merged

        if (buffer.length >= CHUNK_SIZE) {
          try {
            const audioBuffer = await audioContext.decodeAudioData(buffer.buffer.slice(0))
            const source = audioContext.createBufferSource()
            source.buffer = audioBuffer
            source.connect(audioContext.destination)
            if (nextStartTime < audioContext.currentTime) nextStartTime = audioContext.currentTime
            source.start(nextStartTime)
            nextStartTime += audioBuffer.duration
            currentSourceRef.current = source
            lastSource = source
            buffer = new Uint8Array(0)
          } catch {
            // chunk not yet decodable — keep accumulating
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // Flush remaining bytes
          if (buffer.length > 0) {
            try {
              const audioBuffer = await audioContext.decodeAudioData(buffer.buffer.slice(0))
              const source = audioContext.createBufferSource()
              source.buffer = audioBuffer
              source.connect(audioContext.destination)
              if (nextStartTime < audioContext.currentTime) nextStartTime = audioContext.currentTime
              source.start(nextStartTime)
              lastSource = source
            } catch { /* ignore */ }
          }
          if (lastSource) {
            lastSource.onended = () => setIsSpeaking(false)
          } else {
            setIsSpeaking(false)
          }
          break
        }
        if (value) await scheduleChunk(value)
      }
    } catch (err) {
      console.warn('ElevenLabs TTS failed, falling back to speechSynthesis:', err)
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
