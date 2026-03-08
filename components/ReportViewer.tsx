'use client'

import { useState } from 'react'
import { marked } from 'marked'

interface ReportViewerProps {
  markdown: string
}

export default function ReportViewer({ markdown }: ReportViewerProps) {
  const [pdfLoading, setPdfLoading] = useState(false)
  const [docxLoading, setDocxLoading] = useState(false)

  const htmlContent = marked.parse(markdown) as string

  async function handleExportPDF() {
    setPdfLoading(true)
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      })
      if (!res.ok) throw new Error('PDF export failed')
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const tab = window.open(url, '_blank')
      if (tab) {
        tab.addEventListener('load', () => URL.revokeObjectURL(url))
      } else {
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch (err) {
      console.error('[ExportPDF]', err)
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleExportDocx() {
    setDocxLoading(true)
    try {
      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      })
      if (!res.ok) throw new Error('DOCX export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `thala-report-${new Date().toISOString().slice(0, 10)}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[ExportDocx]', err)
    } finally {
      setDocxLoading(false)
    }
  }

  return (
    <div
      style={{
        background: '#0D1526',
        border: '1px solid #1E3A5F',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 0 20px rgba(0,163,255,0.05)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: '#111D35',
          borderBottom: '1px solid #1E3A5F',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            color: '#E8F4FD',
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: '0.03em',
          }}
        >
          Lab Report
        </span>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportPDF}
            disabled={pdfLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              background: 'rgba(0, 163, 255, 0.1)',
              border: '1px solid #1E3A5F',
              borderRadius: '8px',
              color: '#7AA8CC',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              cursor: pdfLoading ? 'not-allowed' : 'pointer',
              opacity: pdfLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {pdfLoading ? <Spinner /> : <PdfIcon />}
            {pdfLoading ? 'Generating PDF…' : 'Export PDF'}
          </button>

          <button
            onClick={handleExportDocx}
            disabled={docxLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              background: 'rgba(0, 163, 255, 0.15)',
              border: '1px solid #00A3FF',
              borderRadius: '8px',
              color: '#00A3FF',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              cursor: docxLoading ? 'not-allowed' : 'pointer',
              opacity: docxLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {docxLoading ? <Spinner /> : <WordIcon />}
            {docxLoading ? 'Generating Word…' : 'Export Word'}
          </button>
        </div>
      </div>

      {/* Rendered markdown */}
      <div
        className="report-body"
        style={{ padding: '32px 36px', overflowX: 'auto' }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />

      <style>{REPORT_STYLES}</style>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: 'report-spin 0.8s linear infinite', flexShrink: 0 }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  )
}

function WordIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )
}

// ─── Scoped styles for rendered markdown ──────────────────────────────────────

const REPORT_STYLES = `
  @keyframes report-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  .report-body h1 {
    font-family: 'Inter', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: #E8F4FD;
    margin: 0 0 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #1E3A5F;
    letter-spacing: 0.01em;
    line-height: 1.3;
  }

  .report-body h2 {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #00A3FF;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 28px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #1E3A5F;
  }

  .report-body h3 {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #7AA8CC;
    margin: 18px 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .report-body p {
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    color: #E8F4FD;
    line-height: 1.7;
    margin: 8px 0;
  }

  .report-body ul,
  .report-body ol {
    padding-left: 22px;
    margin: 8px 0;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    color: #E8F4FD;
  }

  .report-body li {
    line-height: 1.65;
    margin: 4px 0;
  }

  .report-body strong {
    font-weight: 600;
    color: #E8F4FD;
  }

  .report-body em {
    color: #7AA8CC;
    font-style: italic;
  }

  .report-body code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 12px;
    background: rgba(0, 163, 255, 0.08);
    border: 1px solid #1E3A5F;
    color: #00D4A8;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .report-body pre {
    background: #060B18;
    border: 1px solid #1E3A5F;
    border-radius: 8px;
    padding: 16px 20px;
    overflow-x: auto;
    margin: 12px 0;
  }

  .report-body pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    color: #E8F4FD;
  }

  .report-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;
    font-family: 'Inter', sans-serif;
  }

  .report-body thead th {
    background: #111D35;
    color: #00A3FF;
    font-weight: 600;
    text-align: left;
    padding: 9px 14px;
    border: 1px solid #1E3A5F;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .report-body tbody td {
    padding: 8px 14px;
    border: 1px solid #1E3A5F;
    color: #E8F4FD;
    vertical-align: top;
    line-height: 1.5;
  }

  .report-body tbody tr:nth-child(even) td {
    background: rgba(30, 58, 95, 0.25);
  }

  .report-body tbody tr:hover td {
    background: rgba(0, 163, 255, 0.05);
  }

  .report-body hr {
    border: none;
    border-top: 1px solid #1E3A5F;
    margin: 24px 0;
  }

  .report-body blockquote {
    border-left: 3px solid #00A3FF;
    margin: 12px 0;
    padding: 8px 16px;
    background: rgba(0, 163, 255, 0.05);
    border-radius: 0 6px 6px 0;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    color: #7AA8CC;
    font-style: italic;
  }
`
