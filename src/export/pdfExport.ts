function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderInline(source: string): string {
  let text = escapeHtml(source)
  const code: string[] = []

  text = text.replace(/`([^`]+)`/g, (_, value: string) => {
    const index = code.push(`<code>${value}</code>`) - 1
    return `@@GV_CODE_${index}@@`
  })

  text = text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')

  return text.replace(/@@GV_CODE_(\d+)@@/g, (_, index: string) => code[Number(index)] ?? '')
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let quote: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: string[] | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    out.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const flushQuote = () => {
    if (!quote.length) return
    out.push(`<blockquote>${quote.map(line => `<p>${renderInline(line)}</p>`).join('')}</blockquote>`)
    quote = []
  }
  const flushList = () => {
    if (!list) return
    const tag = list.ordered ? 'ol' : 'ul'
    out.push(`<${tag}>${list.items.map(item => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`)
    list = null
  }
  const flushAll = () => {
    flushParagraph()
    flushQuote()
    flushList()
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (code !== null) {
      if (/^```/.test(line.trim())) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = null
      } else {
        code.push(rawLine)
      }
      continue
    }

    if (/^```/.test(line.trim())) {
      flushAll()
      code = []
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushAll()
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      flushAll()
      out.push('<hr>')
      continue
    }

    const blockquote = line.match(/^>\s?(.*)$/)
    if (blockquote) {
      flushParagraph()
      flushList()
      quote.push(blockquote[1])
      continue
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      flushQuote()
      const isOrdered = Boolean(ordered)
      if (list && list.ordered !== isOrdered) flushList()
      if (!list) list = { ordered: isOrdered, items: [] }
      list.items.push((ordered ?? unordered)![1])
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    flushQuote()
    flushList()
    paragraph.push(line.trim())
  }

  flushAll()
  if (code !== null) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}

export function exportNoteAsPdf(title: string, markdown: string): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer')
  if (!printWindow) throw new Error('The browser blocked the PDF export window.')

  const body = markdownToHtml(markdown)
  const safeTitle = escapeHtml(title)

  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    @page { size: A4; margin: 24mm 23mm 26mm; }
    * { box-sizing: border-box; }
    html { background: #fff; }
    body {
      margin: 0 auto;
      max-width: 148mm;
      color: #1c1814;
      background: #fff;
      font-family: Lora, Georgia, 'Times New Roman', serif;
      font-size: 11.5pt;
      line-height: 1.72;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 {
      font-size: 22pt;
      line-height: 1.25;
      font-weight: 500;
      letter-spacing: -0.015em;
      margin: 0 0 12mm;
      page-break-after: avoid;
    }
    h2 { font-size: 16pt; margin: 8mm 0 3mm; font-weight: 600; page-break-after: avoid; }
    h3 { font-size: 13pt; margin: 7mm 0 2mm; font-weight: 600; page-break-after: avoid; }
    h4, h5, h6 { font-size: 11.5pt; margin: 6mm 0 2mm; font-weight: 600; page-break-after: avoid; }
    p { margin: 0 0 4.5mm; orphans: 3; widows: 3; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    blockquote {
      margin: 6mm 0 6mm 7mm;
      padding-left: 5mm;
      border-left: 1px solid #c4b89a;
      color: #4e4842;
    }
    blockquote p { margin-bottom: 2.5mm; }
    ul, ol { margin: 0 0 5mm 6mm; padding-left: 5mm; }
    li { margin-bottom: 1.5mm; }
    hr { border: 0; border-top: 1px solid #d4cec4; width: 22mm; margin: 10mm auto; }
    code, pre { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { font-size: 0.88em; }
    pre {
      white-space: pre-wrap;
      font-size: 9pt;
      line-height: 1.55;
      padding: 4mm 5mm;
      margin: 5mm 0;
      background: #f4f1ec;
      break-inside: avoid;
    }
    a { color: inherit; text-decoration: underline; text-decoration-color: #a09890; }
    .gv-export-title { margin-top: 0; }
    @media print {
      body { max-width: none; }
    }
  </style>
</head>
<body>
  <h1 class="gv-export-title">${safeTitle}</h1>
  ${body}
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 80)
    })
  <\/script>
</body>
</html>`)
  printWindow.document.close()
}
