export function escapeHtml(value: string): string {
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

export function renderMarkdown(markdown: string): string {
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
      flushParagraph(); flushQuote()
      if (code) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null }
      else code = []
      continue
    }
    if (code) { code.push(line); continue }
    if (/^\s*$/.test(line)) { flushParagraph(); flushQuote(); continue }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph(); flushQuote()
      const level = heading[1].length
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }
    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      flushParagraph(); flushQuote(); out.push('<hr>'); continue
    }
    const quoted = line.match(/^>\s?(.*)$/)
    if (quoted) { flushParagraph(); quote.push(quoted[1]); continue }
    flushQuote(); paragraph.push(line.trim())
  }

  flushParagraph(); flushQuote()
  if (code) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}
