import { NextRequest, NextResponse } from 'next/server'
import { marked } from 'marked'

export async function POST(req: NextRequest) {
  try {
    const { markdown } = await req.json() as { markdown: string }

    const bodyHtml = marked.parse(markdown) as string

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thala Lab Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      font-family: Georgia, 'Times New Roman', serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 40px 48px;
      color: #1a1a2e;
      line-height: 1.75;
      background: #ffffff;
      font-size: 14px;
    }

    h1 {
      font-size: 22px;
      text-align: center;
      border-bottom: 2px solid #1a1a2e;
      padding-bottom: 14px;
      margin: 0 0 28px;
      letter-spacing: 0.02em;
    }

    h2 {
      font-size: 17px;
      margin-top: 36px;
      margin-bottom: 10px;
      border-bottom: 1px solid #c0c0c0;
      padding-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    h3 {
      font-size: 15px;
      margin-top: 22px;
      margin-bottom: 8px;
      font-style: italic;
    }

    p { margin: 10px 0; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 13px;
      font-family: Georgia, serif;
    }

    th {
      background: #2d3748;
      color: #ffffff;
      font-weight: bold;
      text-align: left;
      padding: 8px 12px;
      border: 1px solid #2d3748;
    }

    td {
      padding: 7px 12px;
      border: 1px solid #c8c8c8;
      vertical-align: top;
    }

    tr:nth-child(even) td { background: #f7f9fc; }

    code {
      font-family: 'Courier New', Courier, monospace;
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      color: #333;
    }

    pre {
      background: #f4f4f4;
      border: 1px solid #ddd;
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 14px 0;
    }

    pre code { background: none; padding: 0; }

    ul, ol { padding-left: 26px; margin: 10px 0; }
    li { margin: 5px 0; }

    strong { font-weight: bold; }
    em { font-style: italic; }

    hr { border: none; border-top: 1px solid #ccc; margin: 28px 0; }

    /* Print styles */
    @media print {
      @page {
        margin: 2cm 2.5cm;
        size: A4;
      }

      body {
        margin: 0;
        padding: 0;
        max-width: none;
        font-size: 11pt;
        color: #000;
      }

      h1 { font-size: 16pt; }
      h2 { font-size: 13pt; }
      h3 { font-size: 11pt; }

      table { page-break-inside: avoid; }
      h2, h3 { page-break-after: avoid; }
      tr { page-break-inside: avoid; }

      a { color: inherit; text-decoration: none; }
      pre, code { background: #f4f4f4 !important; }
    }
  </style>
</head>
<body>
${bodyHtml}
<script>
  window.onload = function () {
    // Small delay to ensure styles are applied before print dialog
    setTimeout(function () { window.print(); }, 300);
  };
</script>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('[/api/export/pdf]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
