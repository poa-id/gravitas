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

function expired(row) {
  return Date.parse(row.expires_at) <= Date.now()
}

async function readJson(request) {
  const type = request.headers.get('content-type') || ''
  if (!type.includes('application/json')) throw new Error('Expected JSON')
  return request.json()
}

function cors(request, env) {
  const origin = request.headers.get('origin')
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)
  if (!origin || allowed.includes(origin) || origin === 'tauri://localhost' || origin === 'http://tauri.localhost') {
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

  const id = crypto.randomUUID()
  const publicToken = randomToken()
  const ownerKey = randomToken(32)
  const publicTokenHash = await sha256(publicToken)
  const ownerKeyHash = await sha256(ownerKey)
  const snapshotSha256 = await sha256(markdown)
  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + WEEK_MS).toISOString()
  const snapshotKey = `reviews/${id}.md`

  await env.SNAPSHOTS.put(snapshotKey, markdown, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
    customMetadata: { expiresAt, snapshotSha256 },
  })
  try {
    await env.DB.prepare(`INSERT INTO review_sessions
      (id, public_token_hash, owner_key_hash, title, snapshot_key, snapshot_sha256, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, publicTokenHash, ownerKeyHash, title, snapshotKey, snapshotSha256, createdAt, expiresAt).run()
  } catch (error) {
    await env.SNAPSHOTS.delete(snapshotKey)
    throw error
  }

  const base = (env.PUBLIC_REVIEW_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')
  return json({
    id,
    url: `${base}/r/${publicToken}`,
    ownerKey,
    createdAt,
    expiresAt,
    snapshotSha256,
  }, 201)
}

async function sessionForPublicToken(env, token) {
  const tokenHash = await sha256(token)
  return env.DB.prepare('SELECT * FROM review_sessions WHERE public_token_hash = ?').bind(tokenHash).first()
}

async function getPublicReview(env, token) {
  const row = await sessionForPublicToken(env, token)
  if (!row) return json({ error: 'review not found' }, 404)
  if (expired(row)) {
    await purgeSession(env, row)
    return json({ error: 'review expired' }, 410)
  }
  const object = await env.SNAPSHOTS.get(row.snapshot_key)
  if (!object) return json({ error: 'review snapshot unavailable' }, 410)
  return json({
    title: row.title,
    markdown: await object.text(),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    snapshotSha256: row.snapshot_sha256,
  })
}

function validMark(mark) {
  return mark && ['comment', 'revisit', 'question', 'cut'].includes(mark.kind)
    && typeof mark.selectedText === 'string' && mark.selectedText.trim().length > 0
    && typeof mark.contextBefore === 'string' && typeof mark.contextAfter === 'string'
    && typeof mark.comment === 'string'
}

async function submitReview(request, env, token) {
  const row = await sessionForPublicToken(env, token)
  if (!row) return json({ error: 'review not found' }, 404)
  if (expired(row)) {
    await purgeSession(env, row)
    return json({ error: 'review expired' }, 410)
  }
  const body = await readJson(request)
  const reviewerName = typeof body.reviewerName === 'string' ? body.reviewerName.trim().slice(0, 120) : ''
  const reviewerNote = typeof body.reviewerNote === 'string' ? body.reviewerNote.trim().slice(0, 2000) : ''
  const marks = Array.isArray(body.marks) ? body.marks : []
  if (!reviewerName) return json({ error: 'reviewerName is required' }, 400)
  if (marks.length > MAX_MARKS || !marks.every(validMark)) return json({ error: 'invalid review marks' }, 400)

  const cleanMarks = marks.map(mark => ({
    id: typeof mark.id === 'string' ? mark.id : crypto.randomUUID(),
    kind: mark.kind,
    selectedText: mark.selectedText.slice(0, 10000),
    contextBefore: mark.contextBefore.slice(-128),
    contextAfter: mark.contextAfter.slice(0, 128),
    comment: mark.comment.slice(0, 4000),
    status: 'open',
    createdAt: typeof mark.createdAt === 'string' ? mark.createdAt : new Date().toISOString(),
  }))
  const submissionId = crypto.randomUUID()
  const now = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO review_submissions
    (id, session_id, reviewer_name, reviewer_note, marks_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(submissionId, row.id, reviewerName, reviewerNote, JSON.stringify(cleanMarks), now).run()
  return json({ id: submissionId, receivedAt: now }, 201)
}

async function ownerSession(request, env, id) {
  const ownerKey = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!ownerKey) return null
  const ownerKeyHash = await sha256(ownerKey)
  return env.DB.prepare('SELECT * FROM review_sessions WHERE id = ? AND owner_key_hash = ?').bind(id, ownerKeyHash).first()
}

async function getResults(request, env, id) {
  const row = await ownerSession(request, env, id)
  if (!row) return json({ error: 'review not found' }, 404)
  if (expired(row)) {
    await purgeSession(env, row)
    return json({ error: 'review expired' }, 410)
  }
  const result = await env.DB.prepare(`SELECT id, reviewer_name, reviewer_note, marks_json, created_at
    FROM review_submissions WHERE session_id = ? ORDER BY created_at ASC`).bind(id).all()
  return json({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    snapshotSha256: row.snapshot_sha256,
    submissions: (result.results || []).map(item => ({
      id: item.id,
      reviewerName: item.reviewer_name,
      reviewerNote: item.reviewer_note,
      marks: JSON.parse(item.marks_json),
      createdAt: item.created_at,
    })),
  })
}

async function revokeReview(request, env, id) {
  const row = await ownerSession(request, env, id)
  if (!row) return json({ error: 'review not found' }, 404)
  await purgeSession(env, row)
  return new Response(null, { status: 204 })
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}

function reviewerHtml(token) {
  const safeToken = escapeHtml(token)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Review in Gravitas</title><style>
:root{--bg:#EDEDEA;--surface:#E4DDD2;--border:#D4CEC4;--text:#1C1814;--dim:#6B6560;--dimmer:#A09890;--accent:#7A6A4A;--warn:#8B5A3A;font-family:Georgia,serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}main{max-width:680px;margin:0 auto;padding:72px 40px 120px}.meta,.hint,.expires{font:12px ui-monospace,monospace;color:var(--dim);letter-spacing:.02em}.brand{position:fixed;top:22px;left:28px;font:600 13px ui-monospace,monospace}.expires{position:fixed;top:22px;right:28px}.title{font-size:30px;margin:24px 0 42px}.manuscript{font-size:18px;line-height:1.78;white-space:pre-wrap;user-select:text}.toolbar{position:fixed;display:none;z-index:5;background:var(--text);color:var(--bg);padding:6px;border-radius:5px;gap:4px}.toolbar button{border:0;background:transparent;color:inherit;padding:7px 9px;font:11px ui-monospace,monospace;cursor:pointer}.toolbar button:hover{background:#ffffff18}.marks{margin-top:54px;border-top:1px solid var(--border);padding-top:24px}.mark{font:13px ui-monospace,monospace;margin:12px 0;padding:12px;background:#ffffff35}.finish{margin-top:42px;border-top:1px solid var(--border);padding-top:24px}.finish input,.finish textarea{width:100%;border:1px solid var(--border);background:#ffffff40;padding:10px;margin:6px 0 12px;font:14px ui-monospace,monospace}.finish button{border:1px solid var(--text);background:var(--text);color:var(--bg);padding:10px 16px;font:12px ui-monospace,monospace;cursor:pointer}.done{padding:80px 0;text-align:center;color:var(--dim)}@media(max-width:640px){main{padding:70px 22px 100px}.expires{top:44px;left:28px;right:auto}.toolbar{max-width:calc(100vw - 24px);overflow:auto}}
</style></head><body><div class="brand">Gravitas · Review copy</div><div class="expires" id="expires"></div><main id="app"><div class="hint">Loading review…</div></main><div class="toolbar" id="toolbar"><button data-kind="comment">Comment</button><button data-kind="revisit">Revisit</button><button data-kind="question">Question</button><button data-kind="cut">Cut?</button></div><script>
const token=${JSON.stringify(safeToken)};const marks=[];let selected=null;const app=document.getElementById('app');const toolbar=document.getElementById('toolbar');
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderMarks(){const el=document.getElementById('marks');if(!el)return;el.innerHTML=marks.map((m,i)=>'<div class="mark"><strong>'+esc(m.kind)+'</strong> · “'+esc(m.selectedText.slice(0,120))+'”'+(m.comment?'<br>'+esc(m.comment):'')+' <button data-remove="'+i+'">×</button></div>').join('');el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{marks.splice(Number(b.dataset.remove),1);renderMarks()})}
function captureSelection(){const sel=getSelection();if(!sel||sel.isCollapsed)return null;const manuscript=document.getElementById('manuscript');if(!manuscript||!manuscript.contains(sel.anchorNode)||!manuscript.contains(sel.focusNode))return null;const text=sel.toString().trim();if(!text)return null;const full=manuscript.textContent;const at=full.indexOf(text);return{text,contextBefore:at>=0?full.slice(Math.max(0,at-64),at):'',contextAfter:at>=0?full.slice(at+text.length,at+text.length+64):''}}
document.addEventListener('selectionchange',()=>{const data=captureSelection();if(!data){toolbar.style.display='none';return}selected=data;const sel=getSelection();const r=sel.getRangeAt(0).getBoundingClientRect();toolbar.style.display='flex';toolbar.style.left=Math.max(12,Math.min(innerWidth-toolbar.offsetWidth-12,r.left+r.width/2-toolbar.offsetWidth/2))+'px';toolbar.style.top=Math.max(12,r.top-48)+'px'});
toolbar.onclick=e=>{const kind=e.target.dataset.kind;if(!kind||!selected)return;let comment='';if(kind==='comment'||kind==='question')comment=prompt(kind==='question'?'What should the author consider?':'Leave a comment')||'';marks.push({id:crypto.randomUUID(),kind,selectedText:selected.text,contextBefore:selected.contextBefore,contextAfter:selected.contextAfter,comment,status:'open',createdAt:new Date().toISOString()});getSelection().removeAllRanges();toolbar.style.display='none';renderMarks()};
async function load(){const res=await fetch('/api/reviews/'+encodeURIComponent(token));if(!res.ok){app.innerHTML='<div class="done">This review copy is no longer available.</div>';return}const data=await res.json();document.title=data.title+' · Gravitas Review';document.getElementById('expires').textContent='Expires '+new Date(data.expiresAt).toLocaleDateString();app.innerHTML='<div class="hint">Select any passage to leave a review mark.</div><h1 class="title">'+esc(data.title)+'</h1><article class="manuscript" id="manuscript">'+esc(data.markdown)+'</article><section class="marks"><div class="meta">YOUR MARKS</div><div id="marks"></div></section><section class="finish"><div class="meta">FINISH REVIEW</div><input id="name" maxlength="120" placeholder="Your name"><textarea id="note" maxlength="2000" rows="3" placeholder="Optional note to the author"></textarea><button id="send">Send review</button></section>';document.getElementById('send').onclick=send;renderMarks()}
async function send(){const reviewerName=document.getElementById('name').value.trim();if(!reviewerName){document.getElementById('name').focus();return}const button=document.getElementById('send');button.disabled=true;const res=await fetch('/api/reviews/'+encodeURIComponent(token)+'/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewerName,reviewerNote:document.getElementById('note').value,marks})});if(res.ok)app.innerHTML='<div class="done"><strong>Review sent.</strong><br><br>The author will receive your marks in Gravitas.</div>';else button.disabled=false}
load();
</script></body></html>`
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
  if ((match = url.pathname.match(/^\/r\/([^/]+)$/)) && request.method === 'GET') return new Response(reviewerHtml(decodeURIComponent(match[1])), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" } })
  if (url.pathname === '/health') return json({ ok: true })
  return json({ error: 'not found' }, 404)
}

function withCors(response, headers) {
  const next = new Headers(response.headers)
  Object.entries(headers).forEach(([key, value]) => next.set(key, value))
  return new Response(response.body, { status: response.status, headers: next })
}

export default {
  fetch(request, env) {
    return route(request, env).catch(error => {
      console.error(error)
      return json({ error: 'internal error' }, 500)
    })
  },
  async scheduled(_controller, env) {
    const rows = await env.DB.prepare('SELECT * FROM review_sessions WHERE expires_at <= ? LIMIT 100').bind(new Date().toISOString()).all()
    for (const row of rows.results || []) await purgeSession(env, row)
  },
}
