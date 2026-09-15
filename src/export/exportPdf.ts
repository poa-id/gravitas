function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let quote: string[] = []
  let code: string[] | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const flushQuote = () => {
    if (!quote.length) return
    out.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`)
    quote = []
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushParagraph()
      flushQuote()
      if (code) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = null
      } else {
        code = []
      }
      continue
    }

    if (code) {
      code.push(line)
      continue
    }

    if (/^\s*$/.test(line)) {
      flushParagraph()
      flushQuote()
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushQuote()
      const level = heading[1].length
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      flushParagraph()
      flushQuote()
      out.push('<hr>')
      continue
    }

    const quoted = line.match(/^>\s?(.*)$/)
    if (quoted) {
      flushParagraph()
      quote.push(quoted[1])
      continue
    }

    flushQuote()
    paragraph.push(line.trim())
  }

  flushParagraph()
  flushQuote()
  if (code) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}

function buildPrintableDocument(title: string, markdown: string): string {
  const safeTitle = escapeHtml(title)
  const body = markdownToHtml(markdown)

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { size: A4; margin: 24mm 25mm 26mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1C1814; }
  body {
    font-family: Lora, Georgia, 'Times New Roman', serif;
    font-size: 11.5pt;
    line-height: 1.72;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  article { max-width: 148mm; margin: 0 auto; }
  h1.document-title {
    font-size: 22pt;
    line-height: 1.2;
    font-weight: 500;
    margin: 0 0 14mm;
    letter-spacing: -0.015em;
  }
  h1:not(.document-title) { font-size: 18pt; }
  h2 { font-size: 15pt; }
  h3 { font-size: 12.5pt; }
  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    line-height: 1.3;
    margin: 1.5em 0 0.55em;
    break-after: avoid;
  }
  p { margin: 0 0 0.9em; orphans: 3; widows: 3; }
  blockquote {
    margin: 1.2em 0;
    padding-left: 1.1em;
    border-left: 1px solid #C4B89A;
    color: #4f4943;
    font-style: italic;
  }
  hr { border: 0; border-top: 1px solid #D4CEC4; margin: 2em 0; }
  code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.86em; }
  pre {
    white-space: pre-wrap;
    break-inside: avoid;
    padding: 0.9em 1em;
    border: 1px solid #E4DDD2;
    font-size: 9.5pt;
  }
  @media screen {
    body { padding: 24mm 25mm; }
    article { max-width: 148mm; }
  }
</style>
</head>
<body>
<article>
  <h1 class="document-title">${safeTitle}</h1>
  ${body}
</article>
</body>
</html>`
}

export function exportNoteAsPdf(title: string, markdown: string): void {
  // Blob URL is more reliable than writing into an about:blank window. In particular,
  // noopener can make window.open() return null even though the blank tab was created.
  const html = buildPrintableDocument(title, markdown)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank')

  if (!popup) {
    URL.revokeObjectURL(url)
    throw new Error('Allow pop-ups to export a PDF.')
  }

  popup.addEventListener('load', () => {
    // Give browser fonts/layout a beat to settle before opening the native PDF dialog.
    setTimeout(() => {
      popup.focus()
      popup.print()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 180)
  }, { once: true })
}
