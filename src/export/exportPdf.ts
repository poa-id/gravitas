import { escapeHtml, renderMarkdown } from '../read/renderMarkdown'

function buildPrintableDocument(title: string, markdown: string): string {
  const safeTitle = escapeHtml(title)
  const body = renderMarkdown(markdown)

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
  @page { size: A4; margin: 22mm 24mm 24mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1C1814; }
  body {
    font-family: Lora, Georgia, serif;
    font-size: 13.5pt;
    line-height: 1.8;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  article { width: 100%; max-width: 548px; margin: 0 auto; }
  h1.document-title {
    font-family: Lora, Georgia, serif;
    font-size: 19.5pt;
    line-height: 1.3;
    font-weight: 500;
    letter-spacing: -0.015em;
    margin: 0 0 10mm;
  }
  h1:not(.document-title) { font-size: 1.45em; }
  h2 { font-size: 1.25em; }
  h3 { font-size: 1.1em; }
  h1, h2, h3, h4, h5, h6 {
    font-family: Lora, Georgia, serif;
    font-weight: 600;
    line-height: 1.35;
    margin: 1.35em 0 .5em;
    break-after: avoid;
  }
  p { margin: 0 0 .9em; orphans: 3; widows: 3; }
  blockquote {
    margin: 1.15em 0;
    padding-left: 1em;
    border-left: 1px solid #C4B89A;
    color: #6B6560;
  }
  hr { border: 0; border-top: 1px solid #D4CEC4; margin: 1.8em 0; }
  code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: .86em; }
  pre { white-space: pre-wrap; break-inside: avoid; font-size: .82em; line-height: 1.55; }
  @media screen {
    html, body { background: #EDEDEA; }
    body { padding: 40px 48px; }
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
  const html = buildPrintableDocument(title, markdown)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank')

  if (!popup) {
    URL.revokeObjectURL(url)
    throw new Error('Allow pop-ups to export a PDF.')
  }

  popup.addEventListener('load', () => {
    setTimeout(() => {
      popup.focus()
      popup.print()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 180)
  }, { once: true })
}
