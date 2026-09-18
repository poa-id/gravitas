const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SNAPSHOT_BYTES = 512 * 1024
const MAX_MARKS = 500

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
})

const textEncoder = new TextEncoder()

function randomToken(bytes = 24) {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? textEncoder.encode(value) : value)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function expired(row) { return Date.parse(row.expires_at) <= Date.now() }

async function readJson(request) {
  const type = request.headers.get('content-type') || ''
  if (!type.includes('application/json')) throw new Error('Expected JSON')
  return request.json()
}

function cors(request, env) {
  const origin = request.headers.get('origin')
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)
  const selfOrigin = env.PUBLIC_REVIEW_BASE_URL ? new URL(env.PUBLIC_REVIEW_BASE_URL).origin : ''
  if (!origin || allowed.includes(origin) || origin === selfOrigin || origin === 'tauri://localhost' || origin === 'http://tauri.localhost') {
    return origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}
  }
  return null
}

async function purgeSession(env, row) {
  await env.SNAPSHOTS.delete(row.snapshot_key)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM review_submissions WHERE session_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM review_sessions WHERE id = ?').bind(row.id),
  ])
}

async function createReview(request, env) {
  const body = await readJson(request)
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 240) : ''
  const markdown = typeof body.markdown === 'string' ? body.markdown : ''
  if (!title || !markdown) return json({ error: 'title and markdown are required' }, 400)
  if (textEncoder.encode(markdown).byteLength > MAX_SNAPSHOT_BYTES) return json({ error: 'snapshot too large' }, 413)
  const id = crypto.randomUUID(), publicToken = randomToken(), ownerKey = randomToken(32)
  const publicTokenHash = await sha256(publicToken), ownerKeyHash = await sha256(ownerKey), snapshotSha256 = await sha256(markdown)
  const createdAt = new Date().toISOString(), expiresAt = new Date(Date.now() + WEEK_MS).toISOString(), snapshotKey = `reviews/${id}.md`
  await env.SNAPSHOTS.put(snapshotKey, markdown, { httpMetadata: { contentType: 'text/markdown; charset=utf-8' }, customMetadata: { expiresAt, snapshotSha256 } })
  try {
    await env.DB.prepare(`INSERT INTO review_sessions (id, public_token_hash, owner_key_hash, title, snapshot_key, snapshot_sha256, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, publicTokenHash, ownerKeyHash, title, snapshotKey, snapshotSha256, createdAt, expiresAt).run()
  } catch (error) { await env.SNAPSHOTS.delete(snapshotKey); throw error }
  const base = (env.PUBLIC_REVIEW_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')
  return json({ id, url: `${base}/r/${publicToken}`, ownerKey, createdAt, expiresAt, snapshotSha256 }, 201)
}

async function sessionForPublicToken(env, token) {
  return env.DB.prepare('SELECT * FROM review_sessions WHERE public_token_hash = ?').bind(await sha256(token)).first()
}

async function getPublicReview(env, token) {
  const row = await sessionForPublicToken(env, token)
  if (!row) return json({ error: 'review not found' }, 404)
  if (expired(row)) { await purgeSession(env, row); return json({ error: 'review expired' }, 410) }
  const object = await env.SNAPSHOTS.get(row.snapshot_key)
  if (!object) return json({ error: 'review snapshot unavailable' }, 410)
  return json({ title: row.title, markdown: await object.text(), createdAt: row.created_at, expiresAt: row.expires_at, snapshotSha256: row.snapshot_sha256 })
}

function validMark(mark) {
  return mark && ['comment', 'revisit', 'question', 'cut'].includes(mark.kind)
    && typeof mark.selectedText === 'string' && mark.selectedText.trim().length > 0
    && typeof mark.contextBefore === 'string' && typeof mark.contextAfter === 'string' && typeof mark.comment === 'string'
}

async function submitReview(request, env, token) {
  const row = await sessionForPublicToken(env, token)
  if (!row) return json({ error: 'review not found' }, 404)
  if (expired(row)) { await purgeSession(env, row); return json({ error: 'review expired' }, 410) }
  const body = await readJson(request)
  const reviewerName = typeof body.reviewerName === 'string' ? body.reviewerName.trim().slice(0, 120) : ''
  const reviewerNote = typeof body.reviewerNote === 'string' ? body.reviewerNote.trim().slice(0, 2000) : ''
  const marks = Array.isArray(body.marks) ? body.marks : []
  if (!reviewerName) return json({ error: 'reviewerName is required' }, 400)
  if (marks.length > MAX_MARKS || !marks.every(validMark)) return json({ error: 'invalid review marks' }, 400)
  const cleanMarks = marks.map(mark => ({
    id: typeof mark.id === 'string' ? mark.id : crypto.randomUUID(), kind: mark.kind,
    selectedText: mark.selectedText.slice(0, 10000), contextBefore: mark.contextBefore.slice(-128), contextAfter: mark.contextAfter.slice(0, 128),
    comment: mark.comment.slice(0, 4000), status: 'open', createdAt: typeof mark.createdAt === 'string' ? mark.createdAt : new Date().toISOString(),
  }))
  const submissionId = crypto.randomUUID(), now = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO review_submissions (id, session_id, reviewer_name, reviewer_note, marks_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(submissionId, row.id, reviewerName, reviewerNote, JSON.stringify(cleanMarks), now).run()
  return json({ id: submissionId, receivedAt: now }, 201)
}

async function ownerSession(request, env, id) {
  const ownerKey = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!ownerKey) return null
  return env.DB.prepare('SELECT * FROM review_sessions WHERE id = ? AND owner_key_hash = ?').bind(id, await sha256(ownerKey)).first()
}

async function getResults(request, env, id) {
  const row = await ownerSession(request, env, id)
  if (!row) return json({ error: 'review not found' }, 404)
  if (expired(row)) { await purgeSession(env, row); return json({ error: 'review expired' }, 410) }
  const result = await env.DB.prepare(`SELECT id, reviewer_name, reviewer_note, marks_json, created_at FROM review_submissions WHERE session_id = ? ORDER BY created_at ASC`).bind(id).all()
  return json({ id: row.id, title: row.title, createdAt: row.created_at, expiresAt: row.expires_at, snapshotSha256: row.snapshot_sha256,
    submissions: (result.results || []).map(item => ({ id: item.id, reviewerName: item.reviewer_name, reviewerNote: item.reviewer_note, marks: JSON.parse(item.marks_json), createdAt: item.created_at })) })
}

async function revokeReview(request, env, id) {
  const row = await ownerSession(request, env, id)
  if (!row) return json({ error: 'review not found' }, 404)
  await purgeSession(env, row)
  return new Response(null, { status: 204 })
}

function escapeHtml(value) { return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]) }

function reviewerHtml(token) {
  const safeToken = escapeHtml(token)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review in Gravitas</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&display=swap" rel="stylesheet"><style>
:root{--bg:#EDEDEA;--bg-subtle:#EBE5DB;--surface:#E4DDD2;--border:#D4CEC4;--text:#1C1814;--dim:#6B6560;--dimmer:#A09890;--accent:#7A6A4A;--accent-soft:#C4B89A;--link:#4A6A4A;--warn:#8B5A3A;--prose:Lora,Georgia,'Times New Roman',serif;--ui:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text);min-height:100vh}body:before{content:'';position:fixed;inset:0;pointer-events:none;z-index:1000;opacity:.032;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E")}.chrome{position:fixed;top:0;left:0;right:0;height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;z-index:20;font:10px var(--ui);letter-spacing:.06em;color:var(--dimmer);background:linear-gradient(var(--bg),rgba(237,237,234,.92),transparent)}.brand{color:var(--dim);text-transform:uppercase;letter-spacing:.1em}.review-copy{color:var(--accent)}main{width:600px;max-width:calc(100% - 48px);margin:0 auto;padding:78px 0 120px}.hint{font:10px var(--ui);letter-spacing:.04em;color:var(--dimmer);margin-bottom:28px}.title{font:500 26px/1.3 var(--prose);letter-spacing:-.015em;margin:0 0 38px}.manuscript{font-family:var(--prose);font-size:18px;line-height:1.8;font-weight:400;color:var(--text);position:relative;user-select:text}.manuscript p{margin:0 0 .9em}.manuscript h1,.manuscript h2,.manuscript h3,.manuscript h4,.manuscript h5,.manuscript h6{font-family:var(--prose);font-weight:600;line-height:1.35;margin:1.35em 0 .5em;color:var(--text)}.manuscript h1{font-size:1.45em}.manuscript h2{font-size:1.25em}.manuscript h3{font-size:1.1em}.manuscript blockquote{margin:1.15em 0;padding-left:1em;border-left:1px solid var(--accent-soft);color:var(--dim)}.manuscript hr{border:0;border-top:1px solid var(--border);margin:1.8em 0}.manuscript code,.manuscript pre{font-family:var(--ui)}.manuscript code{font-size:.86em}.manuscript pre{white-space:pre-wrap;font-size:.82em;line-height:1.55}.manuscript ::selection,.manuscript::selection{background:rgba(122,106,74,.14)}.toolbar{position:fixed;display:none;z-index:50;transform:translate(-50%,-100%);align-items:center;gap:2px;padding:4px;border:1px solid var(--border);background:var(--bg);box-shadow:0 6px 24px rgba(28,24,20,.09);font-family:var(--ui)}.toolbar button{appearance:none;border:0;background:none;color:var(--dim);font:10px var(--ui);padding:6px 7px;cursor:pointer;white-space:nowrap}.toolbar button:hover,.toolbar button:focus-visible{background:var(--surface);color:var(--text);outline:0}.toolbar kbd{font:9px var(--ui);color:var(--dimmer);margin-right:3px}.toolbar input{width:260px;border:0;outline:0;background:transparent;color:var(--text);font:13px var(--prose);padding:6px 8px}.review-mark{background:linear-gradient(transparent calc(100% - 2px),rgba(122,106,74,.42) 0);padding-bottom:1px}.finish{margin-top:72px;padding-top:18px;border-top:1px solid var(--border);max-width:420px}.finish-trigger{appearance:none;border:0;background:none;padding:5px 0;color:var(--accent);font:10px var(--ui);letter-spacing:.06em;text-transform:uppercase;cursor:pointer}.finish-copy{font:12px/1.55 var(--prose);color:var(--dimmer);margin:7px 0 0}.finish-form{display:none;margin-top:22px}.finish-form.open{display:block}.finish label{display:block;font:9px var(--ui);letter-spacing:.08em;text-transform:uppercase;color:var(--dimmer);margin:14px 0 6px}.finish input,.finish textarea{width:100%;border:0;border-bottom:1px solid var(--border);outline:0;background:transparent;color:var(--text);padding:7px 0;font:400 13px/1.5 var(--prose);resize:none}.finish textarea{min-height:54px}.finish input:focus,.finish textarea:focus{border-color:var(--accent-soft)}.send{margin-top:18px;appearance:none;border:0;background:none;color:var(--accent);padding:5px 0;font:10px var(--ui);letter-spacing:.06em;text-transform:uppercase;cursor:pointer}.send:disabled{opacity:.45}.error{font:11px var(--ui);color:var(--warn);margin-top:12px}.done{padding:25vh 0;text-align:center;font:400 16px/1.7 var(--prose);color:var(--dim)}.done strong{font-weight:500;color:var(--text)}.done-meta{margin-top:8px;font:10px var(--ui);letter-spacing:.04em;color:var(--dimmer)}.read-again{margin-top:28px;appearance:none;border:0;background:none;color:var(--accent);font:10px var(--ui);letter-spacing:.05em;cursor:pointer}@media(max-width:640px){.chrome{padding:0 16px}.chrome .expiry-prefix{display:none}main{max-width:calc(100% - 36px);padding-top:68px}.toolbar{max-width:calc(100vw - 20px);overflow:auto}.toolbar input{width:210px}}
</style></head><body><div class="chrome"><span class="brand">Gravitas <span class="review-copy">· review copy</span></span><span id="expires"><span class="expiry-prefix">Available until </span>…</span></div><main id="app"><div class="hint">Loading review…</div></main><div class="toolbar" id="toolbar"></div><script>
const token=${JSON.stringify(safeToken)};const marks=[];const markRanges=[];let selected=null,composing=null,reviewData=null;const app=document.getElementById('app'),toolbar=document.getElementById('toolbar');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){return esc(s)}
function renderMarkdown(md){const normalized=String(md??'').split(String.fromCharCode(13)).join('');const lines=normalized.split(String.fromCharCode(10)),out=[];let para=[],quote=[],code=null;const flushPara=()=>{if(para.length){out.push('<p>'+inline(para.join(' '))+'</p>');para=[]}};const flushQuote=()=>{if(quote.length){out.push('<blockquote>'+inline(quote.join(' '))+'</blockquote>');quote=[]}};for(const line of lines){const trimmed=line.trim();if(trimmed.slice(0,3)==='```'){flushPara();flushQuote();if(code){out.push('<pre><code>'+esc(code.join(String.fromCharCode(10)))+'</code></pre>');code=null}else code=[];continue}if(code){code.push(line);continue}if(!trimmed){flushPara();flushQuote();continue}let level=0;while(level<6&&line.charAt(level)==='#')level++;if(level>0&&line.charAt(level)===' '){flushPara();flushQuote();out.push('<h'+level+'>'+inline(line.slice(level+1))+'</h'+level+'>');continue}const isDash=trimmed.length>=3&&trimmed.split('').every(ch=>ch==='-'),isUnderscore=trimmed.length>=3&&trimmed.split('').every(ch=>ch==='_'),isStar=trimmed.length>=3&&trimmed.split('').every(ch=>ch==='*');if(isDash||isUnderscore||isStar){flushPara();flushQuote();out.push('<hr>');continue}if(line.charAt(0)==='>'){flushPara();quote.push(line.slice(line.charAt(1)===' '?2:1));continue}flushQuote();para.push(trimmed)}flushPara();flushQuote();if(code)out.push('<pre><code>'+esc(code.join(String.fromCharCode(10)))+'</code></pre>');return out.join(String.fromCharCode(10))}
function textOffset(root,node,offset){const range=document.createRange();range.setStart(root,0);range.setEnd(node,offset);return range.toString().length}
function captureSelection(){const sel=getSelection(),root=document.getElementById('manuscript');if(!sel||sel.isCollapsed||!sel.rangeCount||!root||!root.contains(sel.anchorNode)||!root.contains(sel.focusNode))return null;const range=sel.getRangeAt(0).cloneRange(),text=range.toString().trim();if(!text)return null;const full=root.textContent||'',start=textOffset(root,range.startContainer,range.startOffset),end=textOffset(root,range.endContainer,range.endOffset);return{text,contextBefore:full.slice(Math.max(0,start-64),start),contextAfter:full.slice(end,end+64),range}}
function showActions(){if(!selected)return;toolbar.innerHTML='<button data-kind="comment"><kbd>C</kbd> Comment</button><button data-kind="revisit"><kbd>R</kbd> Revisit</button><button data-kind="question"><kbd>?</kbd> Question</button><button data-kind="cut"><kbd>X</kbd> Cut?</button>';toolbar.style.display='flex';positionToolbar(selected.range)}
function positionToolbar(range){const r=range.getBoundingClientRect();toolbar.style.left=Math.max(toolbar.offsetWidth/2+10,Math.min(innerWidth-toolbar.offsetWidth/2-10,r.left+r.width/2))+'px';toolbar.style.top=Math.max(48,r.top-8)+'px'}
function hideToolbar(){toolbar.style.display='none';composing=null}
function paintMarks(){if(!CSS.highlights||!window.Highlight)return;const ranges=markRanges.filter(Boolean);CSS.highlights.set('gravitas-review',new Highlight(...ranges))}
function addMark(kind,comment=''){if(!selected)return;marks.push({id:crypto.randomUUID(),kind,selectedText:selected.text,contextBefore:selected.contextBefore,contextAfter:selected.contextAfter,comment,status:'open',createdAt:new Date().toISOString()});markRanges.push(selected.range.cloneRange());paintMarks();getSelection()?.removeAllRanges();selected=null;hideToolbar()}
function beginComment(kind){if(!selected)return;composing=kind;toolbar.innerHTML='<input id="mark-comment" maxlength="4000" placeholder="'+(kind==='question'?'What should the author consider?':'Leave a comment')+'" aria-label="Review comment">';toolbar.style.display='flex';positionToolbar(selected.range);const input=document.getElementById('mark-comment');input.focus();input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addMark(kind,input.value)}if(e.key==='Escape'){e.preventDefault();showActions()}}}
function choose(kind){if(!selected)return;if(kind==='comment'||kind==='question')beginComment(kind);else addMark(kind)}
toolbar.addEventListener('pointerdown',e=>e.stopPropagation());toolbar.addEventListener('click',e=>{const button=e.target.closest('[data-kind]');if(button)choose(button.dataset.kind)});
document.addEventListener('selectionchange',()=>{if(composing)return;const data=captureSelection();if(!data){if(!toolbar.contains(document.activeElement))hideToolbar();return}selected=data;requestAnimationFrame(showActions)});
document.addEventListener('keydown',e=>{if(composing||!selected||e.metaKey||e.ctrlKey||e.altKey)return;const k=e.key.toLowerCase();if(k==='c'){e.preventDefault();choose('comment')}else if(k==='r'){e.preventDefault();choose('revisit')}else if(e.key==='?'){e.preventDefault();choose('question')}else if(k==='x'){e.preventDefault();choose('cut')}else if(e.key==='Escape'){getSelection()?.removeAllRanges();selected=null;hideToolbar()}});
async function load(){const res=await fetch('/api/reviews/'+encodeURIComponent(token));if(!res.ok){app.innerHTML='<div class="done">This review copy is no longer available.</div>';return}const data=await res.json();reviewData=data;document.title=data.title+' · Gravitas Review';document.getElementById('expires').innerHTML='<span class="expiry-prefix">Available until </span>'+new Date(data.expiresAt).toLocaleDateString(undefined,{month:'short',day:'numeric'});app.innerHTML='<div class="hint">Select a passage to leave a mark · C comment · R revisit · ? question · X cut?</div><h1 class="title">'+esc(data.title)+'</h1><article class="manuscript" id="manuscript">'+renderMarkdown(data.markdown)+'</article><section class="finish"><button class="finish-trigger" id="finish-trigger">Finish review</button><p class="finish-copy" id="finish-copy">Your marks stay with this review copy until you send them.</p><div class="finish-form" id="finish-form"><label for="name">Your name</label><input id="name" maxlength="120" autocomplete="name"><label for="note">Note to the author · optional</label><textarea id="note" maxlength="2000" rows="3"></textarea><button class="send" id="send">Send review</button><div class="error" id="send-error" hidden></div></div></section>';document.getElementById('finish-trigger').onclick=()=>{document.getElementById('finish-form').classList.add('open');document.getElementById('finish-trigger').hidden=true;document.getElementById('finish-copy').hidden=true;document.getElementById('name').focus()};document.getElementById('send').onclick=send}
async function send(){const name=document.getElementById('name'),button=document.getElementById('send'),error=document.getElementById('send-error'),reviewerName=name.value.trim();if(!reviewerName){name.focus();return}button.disabled=true;error.hidden=true;try{const res=await fetch('/api/reviews/'+encodeURIComponent(token)+'/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewerName,reviewerNote:document.getElementById('note').value,marks})});if(!res.ok)throw new Error('Could not send review');app.innerHTML='<div class="done"><strong>Review sent.</strong><br>Your notes have been returned to the author.<div class="done-meta">'+marks.length+' mark'+(marks.length===1?'':'s')+' · '+esc(reviewerName)+'</div><button class="read-again" id="read-again">Read the manuscript again</button></div>';document.getElementById('read-again').onclick=()=>{app.innerHTML='<div class="hint">Review sent · read-only copy</div><h1 class="title">'+esc(reviewData.title)+'</h1><article class="manuscript" id="manuscript">'+renderMarkdown(reviewData.markdown)+'</article>';hideToolbar()};hideToolbar()}catch(e){button.disabled=false;error.textContent='Could not send the review. Please try again.';error.hidden=false}}
load();
</script><style>::highlight(gravitas-review){background-color:rgba(196,184,154,.18);text-decoration:underline;text-decoration-color:rgba(122,106,74,.55);text-decoration-thickness:1px;text-underline-offset:3px}</style></body></html>`
}

async function route(request, env) {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') {
    const headers = cors(request, env)
    if (!headers) return new Response(null, { status: 403 })
    return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization', 'access-control-max-age': '86400' } })
  }
  const headers = cors(request, env)
  if (!headers) return json({ error: 'origin not allowed' }, 403)
  let match
  if (request.method === 'POST' && url.pathname === '/api/reviews') return withCors(await createReview(request, env), headers)
  if ((match = url.pathname.match(/^\/api\/reviews\/([^/]+)$/)) && request.method === 'GET') return withCors(await getPublicReview(env, decodeURIComponent(match[1])), headers)
  if ((match = url.pathname.match(/^\/api\/reviews\/([^/]+)\/submissions$/)) && request.method === 'POST') return withCors(await submitReview(request, env, decodeURIComponent(match[1])), headers)
  if ((match = url.pathname.match(/^\/api\/owner\/reviews\/([^/]+)$/)) && request.method === 'GET') return withCors(await getResults(request, env, decodeURIComponent(match[1])), headers)
  if ((match = url.pathname.match(/^\/api\/owner\/reviews\/([^/]+)$/)) && request.method === 'DELETE') return withCors(await revokeReview(request, env, decodeURIComponent(match[1])), headers)
  if ((match = url.pathname.match(/^\/r\/([^/]+)$/)) && request.method === 'GET') return new Response(reviewerHtml(decodeURIComponent(match[1])), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" } })
  if (url.pathname === '/health') return json({ ok: true })
  return json({ error: 'not found' }, 404)
}

function withCors(response, headers) {
  const next = new Headers(response.headers)
  Object.entries(headers).forEach(([key, value]) => next.set(key, value))
  return new Response(response.body, { status: response.status, headers: next })
}

export default {
  fetch(request, env) { return route(request, env).catch(error => { console.error(error); return json({ error: 'internal error' }, 500) }) },
  async scheduled(_controller, env) {
    const rows = await env.DB.prepare('SELECT * FROM review_sessions WHERE expires_at <= ? LIMIT 100').bind(new Date().toISOString()).all()
    for (const row of rows.results || []) await purgeSession(env, row)
  },
}
