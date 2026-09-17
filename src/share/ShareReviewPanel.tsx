import { useEffect, useState } from 'react'
import { getPreferences } from '../workshop/preferences'
import { reviewServiceConfigured } from './reviewClient'
import { createShareForNote, getShareForNote, refreshShare, revokeShare, shareExpired } from './shareController'
import type { LocalShareSession } from './shareStore'
import './ShareReviewPanel.css'

interface Props {
  open: boolean
  workshopPath?: string
  notePath: string
  title: string
  markdown: string
  onClose: () => void
  onImported: () => void
}

type Busy = 'create' | 'refresh' | 'revoke' | null

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ShareReviewPanel({ open, workshopPath, notePath, title, markdown, onClose, onImported }: Props) {
  const [resolvedWorkshopPath, setResolvedWorkshopPath] = useState(workshopPath ?? '')
  const [session, setSession] = useState<LocalShareSession | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState('')
  const configured = reviewServiceConfigured()

  useEffect(() => {
    if (!open) return
    let alive = true
    setMessage('')
    const resolve = async () => {
      const path = workshopPath || (await getPreferences()).lastWorkshopPath || ''
      if (!alive) return
      setResolvedWorkshopPath(path)
      if (!path) { setSession(null); return }
      const found = await getShareForNote(path, notePath)
      if (alive) setSession(found)
    }
    resolve().catch(error => { if (alive) setMessage(error instanceof Error ? error.message : 'Could not read review state.') })
    return () => { alive = false }
  }, [open, workshopPath, notePath])

  if (!open) return null

  const active = session && !shareExpired(session)
  const canShare = configured && Boolean(resolvedWorkshopPath)

  const create = async () => {
    if (!resolvedWorkshopPath) return
    setBusy('create'); setMessage('')
    try {
      const next = await createShareForNote(resolvedWorkshopPath, notePath, title, markdown)
      setSession(next)
      setMessage('Review copy ready.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create review copy.') }
    finally { setBusy(null) }
  }

  const copy = async () => {
    if (!session) return
    try { await navigator.clipboard.writeText(session.url); setMessage('Link copied.') }
    catch { setMessage('Could not copy the link.') }
  }

  const refresh = async () => {
    if (!session || !resolvedWorkshopPath) return
    setBusy('refresh'); setMessage('')
    try {
      const result = await refreshShare(resolvedWorkshopPath, session)
      setSession(result.session)
      if (result.importedMarks) {
        setMessage(`Imported ${result.importedMarks} review mark${result.importedMarks === 1 ? '' : 's'}.`)
        onImported()
      } else setMessage('No new review marks yet.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not check for reviews.') }
    finally { setBusy(null) }
  }

  const revoke = async () => {
    if (!session) return
    setBusy('revoke'); setMessage('')
    try { await revokeShare(session); setMessage('Review copy closed.'); setSession(null) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not close review copy.') }
    finally { setBusy(null) }
  }

  return <aside className="gv-share-panel" aria-label="Share for Review">
    <div className="gv-share-head"><div><span className="gv-share-eyebrow">Share for Review</span><h2>{title}</h2></div><button className="gv-share-close" onClick={onClose} aria-label="Close">×</button></div>
    {!configured ? <div className="gv-share-body"><p>The review service is not configured in this build.</p><p className="gv-share-muted">Your manuscript has not left this computer.</p></div> : !resolvedWorkshopPath ? <div className="gv-share-body"><p>Could not resolve the active workshop.</p><p className="gv-share-muted">Your manuscript has not left this computer.</p></div> : active && session ? <div className="gv-share-body">
      <p>A fixed review copy is available until <strong>{dateLabel(session.expiresAt)}</strong>.</p>
      <div className="gv-share-link"><input readOnly value={session.url} aria-label="Review link"/><button onClick={copy}>Copy</button></div>
      <div className="gv-share-actions"><button onClick={refresh} disabled={busy !== null}>{busy === 'refresh' ? 'Checking…' : 'Check for reviews'}</button><button className="quiet" onClick={revoke} disabled={busy !== null}>Close review copy</button></div>
    </div> : <div className="gv-share-body">
      {session && shareExpired(session) && <p className="gv-share-muted">The previous review copy has expired.</p>}
      <p>A snapshot of this note will be uploaded for review. Your workshop and original Markdown file remain on your computer.</p>
      <div className="gv-share-note"><strong>Review copies are temporary.</strong><span>Shared manuscripts automatically expire and are deleted after seven days. Your workshop remains on your computer.</span></div>
      <button className="gv-share-create" onClick={create} disabled={busy !== null || !canShare}>{busy === 'create' ? 'Creating…' : 'Create review link'}</button>
    </div>}
    {message && <div className="gv-share-message" role="status">{message}</div>}
  </aside>
}
