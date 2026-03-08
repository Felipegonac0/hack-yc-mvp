import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession, type Calculation, type MaterialUsed } from '@/lib/session'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are Thala, an intelligent and friendly laboratory assistant specialized in PCR protocols. You assist scientists during real-time protocol execution.

RULES:
1. Always respond in English, professionally but warmly
2. When performing calculations, ALWAYS include this structure in your response:
   [CALC]{"id":"unique_id","title":"calculation name","formula":"original formula","steps":"algebraic steps if needed","result":"numeric result","unit":"unit","table":[]}[/CALC]
3. When identifying materials used:
   [MAT]{"name":"material name","amount":"amount used"}[/MAT]
4. If a user has a problem (non-pipettable volume, limited DNA, limited master mix), proactively propose a solution with full calculations shown
5. Follow the loaded protocol. If none, use the standard Q5 PCR protocol
6. Be proactive: if you detect a problematic value, warn the user
7. FIRST RESPONSE RULE: When sessionHistory is empty (this is the first message of a new session), your reply must start by checking the protocol:
   - If a protocol is loaded (provided in context): "I can see you have the [protocol name] protocol loaded. Would you like to use it for this session?"
   - If no protocol is loaded: "I'll use the standard Q5 High-Fidelity PCR protocol. Shall we begin?"

BASE PCR PROTOCOL (Q5 High-Fidelity):
Materials: Q5 High-Fidelity 2X Master Mix, 10 µM Forward Primer, 10 µM Reverse Primer, DNA Template, Nuclease-Free H2O
Procedure:
1. Add Q5 2X Master Mix to PCR tube
2. Add each primer to final concentration of 500 nM
3. Add up to 10 ng template DNA
4. Add nuclease-free water to final reaction volume (2x master mix volume)
5. Gently mix. Spin briefly to collect liquid.
6. Transfer to thermocycler:
   - Initial denaturation: 98°C, 30s
   - Denaturation: 98°C, 10s (25-35 cycles)
   - Annealing: 60°C, 20s
   - Extension: 72°C, 25s
   - Final extension: 72°C, 2 min
   - Hold: 4°C, ∞

KEY CALCULATIONS YOU MUST HANDLE:
- Non-pipettable volumes (<0.5 µL): propose dilution using C₁V₁=C₂V₂, target 10 ng/µL working stocks, final dilution volume 50-100 µL
- Limited master mix: scale reaction down (20µL → 10µL → 8µL), Master Mix = Vreaction/2
- Primer volume: V₁ = (C₂·V₂)/C₁, stock=10µM, target final=500nM
- Template volume: V = DNA_desired / DNA_concentration`

function parseCalcTags(text: string): Calculation[] {
  const results: Calculation[] = []
  const regex = /\[CALC\]([\s\S]*?)\[\/CALC\]/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      results.push(JSON.parse(match[1].trim()))
    } catch {
      // malformed JSON — skip
    }
  }
  return results
}

function parseMatTags(text: string): MaterialUsed[] {
  const results: MaterialUsed[] = []
  const regex = /\[MAT\]([\s\S]*?)\[\/MAT\]/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      results.push(JSON.parse(match[1].trim()))
    } catch {
      // malformed JSON — skip
    }
  }
  return results
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, sessionHistory = [] } = body as {
      message: string
      sessionHistory: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    // Inject loaded protocol into system prompt if present
    const session = getSession()
    const systemWithProtocol = session.protocol
      ? `${SYSTEM_PROMPT}\n\nLOADED PROTOCOL:\n${session.protocol}`
      : SYSTEM_PROMPT

    // Build messages array: existing history + new user message
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...sessionHistory,
      { role: 'user', content: message },
    ]

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemWithProtocol,
      messages,
    })

    const replyContent = response.content[0]
    if (replyContent.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 })
    }

    const reply = replyContent.text
    const calculations = parseCalcTags(reply)
    const materials = parseMatTags(reply)

    // Persist to session (re-fetch to get latest state)
    const latestSession = getSession()
    updateSession({
      isActive: true,
      startTime: latestSession.startTime ?? new Date(),
      transcript: [
        ...latestSession.transcript,
        { role: 'user', text: message, timestamp: new Date() },
        { role: 'agent', text: reply, timestamp: new Date() },
      ],
      calculations: [
        ...latestSession.calculations,
        ...calculations,
      ],
      materialsUsed: [
        ...latestSession.materialsUsed,
        ...materials,
      ],
    })

    return NextResponse.json({ reply, calculations, materials })
  } catch (error) {
    console.error('[/api/chat]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
