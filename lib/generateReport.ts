import Anthropic from '@anthropic-ai/sdk'
import { getSession, updateSession, type SessionState } from './session'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a scientific report generator. Generate a complete formal lab report in Markdown.
Use EXACTLY this structure:

# [Descriptive experiment title]

## General Information
| Field | Value |
|---|---|
| Date | [date] |
| Duration | [duration] |
| Researcher | [if mentioned, else "Not specified"] |
| Protocol | [protocol name] |

## Objective
[Paragraph describing the goal]

## Protocol Used
### Materials
[bullet list]
### Procedure
[numbered steps]
### Thermocycler Configuration
| Step | Temperature | Time |
|---|---|---|
[rows]

## Modifications Made
[For EACH modification:]
### [Modification Name]
**Justification:** [why it was needed]
**Original Formula:** \`formula\`
**Solved For:** \`rearranged formula\` (if applicable)
**Results:**
| [relevant columns] |
|---|
| [data rows] |

## Materials Used
| Material | Amount |
|---|---|

## Conclusion
[Full paragraph: what was done, what modifications were necessary and why, results obtained, observations]`

function formatDuration(startTime: Date | string | null, endTime: Date | string | null): string {
  if (!startTime) return 'Unknown'
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : new Date()
  const ms = end.getTime() - start.getTime()
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes} minutes`
}

export async function generateReportFromSession(session: SessionState): Promise<string> {
  const transcriptText = session.transcript
    .map(e => `[${e.role.toUpperCase()}]: ${e.text}`)
    .join('\n\n')

  const calculationsText = session.calculations
    .map(c => {
      let line = `- ${c.title}: ${c.formula} = ${c.result} ${c.unit}`
      if (c.steps) line += `\n  Steps: ${c.steps}`
      if (c.table && c.table.length > 0) {
        line += `\n  Table: ${JSON.stringify(c.table)}`
      }
      return line
    })
    .join('\n')

  const materialsText = session.materialsUsed
    .map(m => `- ${m.name}: ${m.amount}`)
    .join('\n')

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const userMessage = `Generate the report based on this session:

Transcript:
${transcriptText || 'No transcript available.'}

Calculations performed:
${calculationsText || 'None recorded.'}

Protocol used:
${session.protocol || 'Standard Q5 High-Fidelity PCR Protocol'}

Materials:
${materialsText || 'None recorded.'}

Duration: ${formatDuration(session.startTime, session.endTime)}
Date: ${date}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')
  return content.text
}

export async function generateAndSaveReport(): Promise<void> {
  const session = getSession()
  const report = await generateReportFromSession(session)
  updateSession({ reportGenerated: report })
}
