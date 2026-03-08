import { NextRequest, NextResponse } from 'next/server'
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  Packer,
} from 'docx'

type DocxElement = Paragraph | Table

// Parse inline markdown: **bold**, *italic*, `code`
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }))
    }
    const part = match[0]
    if (part.startsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
    } else if (part.startsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }))
    } else if (part.startsWith('`')) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: { name: 'Courier New' }, size: 20 }))
    }
    lastIndex = match.index + part.length
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }))
  }

  return runs.length > 0 ? runs : [new TextRun({ text })]
}

// Parse table separator row: |---|:---:|---|
function isSeparatorRow(row: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(row.trim())
}

function buildTable(tableLines: string[]): Table {
  const rows = tableLines.map((row, rowIdx) => {
    const cells = row
      .trim()
      .split('|')
      .slice(1, -1)
      .map(c => c.trim())

    return new TableRow({
      tableHeader: rowIdx === 0,
      children: cells.map(
        cell =>
          new TableCell({
            children: [
              new Paragraph({
                children: inlineRuns(cell),
                spacing: { before: 60, after: 60 },
              }),
            ],
            shading:
              rowIdx === 0
                ? { type: ShadingType.SOLID, fill: '2D3748', color: '2D3748' }
                : undefined,
          })
      ),
    })
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    },
    rows,
  })
}

function markdownToDocxElements(markdown: string): DocxElement[] {
  const lines = markdown.split('\n')
  const elements: DocxElement[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Fenced code block
    if (trimmed.startsWith('```')) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      if (codeLines.length > 0) {
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeLines.join('\n'),
                font: { name: 'Courier New' },
                size: 18,
              }),
            ],
            spacing: { before: 120, after: 120 },
          })
        )
      }
      continue
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 })
      )
      i++
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 })
      )
      i++
      continue
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        new Paragraph({
          text: trimmed.slice(2),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        })
      )
      i++
      continue
    }

    // Table: collect all contiguous | lines
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!isSeparatorRow(lines[i])) {
          tableLines.push(lines[i])
        }
        i++
      }
      if (tableLines.length > 0) {
        elements.push(buildTable(tableLines))
        elements.push(new Paragraph({ text: '', spacing: { before: 80, after: 80 } }))
      }
      continue
    }

    // Bullet list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        new Paragraph({
          children: inlineRuns(trimmed.slice(2)),
          bullet: { level: 0 },
        })
      )
      i++
      continue
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s(.+)/)
    if (numMatch) {
      elements.push(
        new Paragraph({
          children: [new TextRun({ text: `${numMatch[1]}. ` }), ...inlineRuns(numMatch[2])],
          indent: { left: 360 },
        })
      )
      i++
      continue
    }

    // Horizontal rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      elements.push(new Paragraph({ text: '', spacing: { before: 200, after: 200 } }))
      i++
      continue
    }

    // Empty line
    if (trimmed === '') {
      elements.push(new Paragraph({ text: '' }))
      i++
      continue
    }

    // Regular paragraph with inline formatting
    elements.push(
      new Paragraph({
        children: inlineRuns(trimmed),
        spacing: { before: 80, after: 80 },
      })
    )
    i++
  }

  return elements
}

export async function POST(req: NextRequest) {
  try {
    const { markdown } = (await req.json()) as { markdown: string }

    const children = markdownToDocxElements(markdown)

    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            basedOn: 'Normal',
            run: { font: { name: 'Georgia' }, size: 24 },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          children,
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)
    const today = new Date().toISOString().slice(0, 10)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="thala-report-${today}.docx"`,
      },
    })
  } catch (error) {
    console.error('[/api/export/docx]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
