import { useEffect, useState } from 'react'
import { getPreferences, setPreference, type GravitasPreferences } from '../workshop/preferences'
import { open } from '@tauri-apps/plugin-dialog'
import './Prefs.css'

interface PrefsProps {
  open: boolean
  onClose: () => void
  onWorkshopChange: (path: string) => void
  onSoundChange: (enabled: boolean) => void        // ← add
  onPasteIntentChange: (enabled: boolean) => void  // ← add
}


export default function Prefs({ open: isOpen, onClose, onWorkshopChange, onSoundChange, onPasteIntentChange }: PrefsProps) {
  const [prefs, setPrefs] = useState<GravitasPreferences | null>(null)

  useEffect(() => {
    if (!isOpen) return
    getPreferences().then(setPrefs)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  async function toggle<K extends keyof GravitasPreferences>(
    key: K,
    value: GravitasPreferences[K]
  ) {
    await setPreference(key, value)
    setPrefs(prev => prev ? { ...prev, [key]: value } : prev)
  }

  if (!isOpen || !prefs) return null

  return (
    <div className="gv-prefs-overlay" onClick={onClose}>
      <div className="gv-prefs" onClick={e => e.stopPropagation()}>

        <div className="gv-prefs-header">
          <span className="gv-prefs-title">Preferences</span>
          <span className="gv-prefs-close" onClick={onClose}>← back</span>
        </div>

        <div className="gv-prefs-body">

          {/* Sound */}
          <div className="gv-prefs-row">
            <span className="gv-prefs-label">Sound</span>
            <div className="gv-prefs-options">
              <span
                className={`gv-prefs-option ${prefs.soundEnabled !== false ? 'active' : ''}`}
                onClick={() => { toggle('soundEnabled', true); onSoundChange(true) }}
              >On</span>
              <span
                className={`gv-prefs-option ${prefs.soundEnabled === false ? 'active' : ''}`}
                onClick={() => { toggle('soundEnabled', false); onSoundChange(false) }}
              >Off</span>
            </div>
          </div>

          {/* On open */}
          <div className="gv-prefs-row">
            <span className="gv-prefs-label">On open</span>
            <div className="gv-prefs-options">
              <span
                className={`gv-prefs-option ${prefs.onOpen === 'resume' ? 'active' : ''}`}
                onClick={() => toggle('onOpen', 'resume')}
              >Resume last note</span>
              <span
                className={`gv-prefs-option ${prefs.onOpen === 'folio' ? 'active' : ''}`}
                onClick={() => toggle('onOpen', 'folio')}
              >Today's folio</span>
            </div>
          </div>

          {/* Paste intent */}
          <div className="gv-prefs-row">
            <span className="gv-prefs-label">Paste intent</span>
            <div className="gv-prefs-options">
              <span
                className={`gv-prefs-option ${prefs.pasteIntentEnabled !== false ? 'active' : ''}`}
                onClick={() => { toggle('pasteIntentEnabled', true); onPasteIntentChange(true) }}
              >On</span>
              <span
                className={`gv-prefs-option ${prefs.pasteIntentEnabled === false ? 'active' : ''}`}
                onClick={() => { toggle('pasteIntentEnabled', false); onPasteIntentChange(false) }}
              >Off</span>
            </div>
          </div>

          {/* Divider */}
          <div className="gv-prefs-divider" />

          {/* Workshop */}
          <div className="gv-prefs-row gv-prefs-row-col">
            <span className="gv-prefs-label">Workshop</span>
            <span className="gv-prefs-path">{prefs.lastWorkshopPath || '—'}</span>
            <span
              className="gv-prefs-action"
              onClick={async () => {
                const selected = await open({
                  directory: true,
                  multiple: false,
                  title: 'Open a workshop',
                })
                if (selected && typeof selected === 'string') {
                  onWorkshopChange(selected)
                  onClose()
                }
              }}
            >Open different workshop →</span>
          </div>

          {/* Known workshops */}
          {prefs.knownWorkshops && prefs.knownWorkshops.length > 1 && (
            <div className="gv-prefs-row gv-prefs-row-col">
              <span className="gv-prefs-label">Recent workshops</span>
              {prefs.knownWorkshops
                .filter(p => p !== prefs.lastWorkshopPath)
                .map(p => (
                  <span
                    key={p}
                    className="gv-prefs-action"
                    onClick={() => { onWorkshopChange(p); onClose() }}
                  >
                    {p.split('/').pop()} →
                  </span>
                ))}
            </div>
          )}

        </div>

        <div className="gv-prefs-footer">
          <span className="gv-prefs-version">Gravitas</span>
        </div>

      </div>
    </div>
  )
}
