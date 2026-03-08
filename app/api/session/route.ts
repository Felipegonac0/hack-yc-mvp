import { getSession, subscribeToSession, type SessionState } from '@/lib/session'

export const dynamic = 'force-dynamic'

function stateToSSE(state: SessionState): string {
  return `data: ${JSON.stringify(state)}\n\n`
}

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send current state immediately on connect
      controller.enqueue(encoder.encode(stateToSSE(getSession())))

      // Subscribe to future updates
      const unsubscribe = subscribeToSession((state) => {
        try {
          controller.enqueue(encoder.encode(stateToSSE(state)))
        } catch {
          // Client disconnected
          unsubscribe()
        }
      })

      // Clean up on stream close (client disconnects)
      // ReadableStream cancel is called when the reader is released
      return () => {
        unsubscribe()
      }
    },
    cancel() {
      // Called when client disconnects — nothing extra needed, handled above
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
