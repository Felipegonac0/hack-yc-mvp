import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { text } = await req.json()

  const elevenRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v3',
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.85,
          style: 0.75,
          use_speaker_boost: true,
        },
      }),
    }
  )

  if (!elevenRes.ok) {
    return new Response('TTS failed', { status: 500 })
  }

  return new Response(elevenRes.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    },
  })
}
