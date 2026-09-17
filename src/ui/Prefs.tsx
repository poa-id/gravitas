import { useEffect, useState } from 'react'
import { getPreferences, setPreference, type GravitasPreferences, type InterfaceSize, type SpellcheckLanguage } from '../workshop/preferences'
import { open } from '@tauri-apps/plugin-dialog'
import './Prefs.css'

interface PrefsProps {
  open: boolean
  onClose: () => void
  onWorkshopChange: (path: string) => void
  onSoundChange: (enabled: boolean) => void
  onPasteIntentChange: (enabled: boolean) => void
  onSpellcheckLanguageChange?: (language: SpellcheckLanguage) => void
}

function applyInterfaceSize(size: InterfaceSize) {
  document.documentElement.dataset.uiSize = size
}

export default function Prefs({ open: isOpen, onClose, onWorkshopChange, onSoundChange, onPasteIntentChange, onSpellcheckLanguageChange }: PrefsProps) {
  const [prefs, setPrefs] = useState<GravitasPreferences | null>(null)

  useEffect(() => {
    getPreferences().then(next => {
      setPrefs(next)
      applyInterfaceSize(next.interfaceSize)
    })
  }, [])

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
  }, [isOpen, onClose])

  async function toggle<K extends keyof GravitasPreferences>(key: K, value: GravitasPreferences[K]) {
    await setPreference(key, value)
    setPrefs(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function setInterfaceSize(size: InterfaceSize) {
    applyInterfaceSize(size)
    await toggle('interfaceSize', size)
  }

  async function setSpellcheckLanguage(language: SpellcheckLanguage) {
    await toggle('spellcheckLanguage', language)
    onSpellcheckLanguageChange?.(language)
  }

  if (!isOpen || !prefs) return null

  return (
    <div className="gv-prefs-overlay" onClick={onClose}>
      <div className="gv-prefs" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Preferences">
        <div className="gv-prefs-header">
          <span className="gv-prefs-title">Preferences</span>
          <button className="gv-prefs-close" onClick={onClose}>← back</button>
        </div>

        <div className="gv-prefs-body">
          <div className="gv-prefs-row">
            <span className="gv-prefs-label">Interface size</span>
            <div className="gv-prefs-options" aria-label="Interface size">
              {(['small', 'regular', 'large'] as InterfaceSize[]).map(size => (
                <button key={size} className={`gv-prefs-option ${prefs.interfaceSize === size ? 'active' : ''}`}
                  aria-pressed={prefs.interfaceSize === size} onClick={() => setInterfaceSize(size)}>
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="gv-prefs-row">
            <span className="gv-prefs-label">Spellcheck</span>
            <div className="gv-prefs-options" aria-label="Spellcheck language">
              {([
                ['off', 'Off'],
                ['en', 'English'],
                ['es-AR', 'Español (Argentina)'],
              ] as [SpellcheckLanguage, string][]).map(([language, label]) => (
                <button key={language} className={`gv-prefs-option ${prefs.spellcheckLanguage === language ? 'active' : ''}`}
                  aria-pressed={prefs.spellcheckLanguage === language} onClick={() => setSpellcheckLanguage(language)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="gv-prefs-row">
            <span className="gv-prefs-label">Sound</span>
            <div className="gv-prefs-options">
              <button className={`gv-prefs-option ${prefs.soundEnabled !== false ? 'active' : ''}`}
                aria-pressed={prefs.soundEnabled !== false} onClick={() => { toggle('soundEnabled', true); onSoundChange(true) }}>On</button>
              <button className={`gv-prefs-option ${prefs.soundEnabled === false ? 'active' : ''}`}
                aria-pressed={prefs.soundEnabled === false} onClick={() => { toggle('soundEnabled', false); onSoundChange(false) }}>Off</button>
            </div>
          </div>

          <div className="gv-prefs-row">
            <span className="gv-prefs-label">On open</span>
            <div className="gv-prefs-options">
              <button className={`gv-prefs-option ${prefs.onOpen === 'resume' ? 'active' : ''}`}
                aria-pressed={prefs.onOpen === 'resume'} onClick={() => toggle('onOpen', 'resume')}>Resume last note</button>
              <button className={`gv-prefs-option ${prefs.onOpen === 'folio' ? 'active' : ''}`}
                aria-pressed={prefs.onOpen === 'folio'} onClick={() => toggle('onOpen', 'folio')}>Today's folio</button>
            </div>
          </div>

          <div className="gv-prefs-row">
            <span className="gv-prefs-label">Paste intent</span>
            <div className="gv-prefs-options">
              <button className={`gv-prefs-option ${prefs.pasteIntentEnabled !== false ? 'active' : ''}`}
                aria-pressed={prefs.pasteIntentEnabled !== false} onClick={() => { toggle('pasteIntentEnabled', true); onPasteIntentChange(true) }}>On</button>
              <button className={`gv-prefs-option ${prefs.pasteIntentEnabled === false ? 'active' : ''}`}
                aria-pressed={prefs.pasteIntentEnabled === false} onClick={() => { toggle('pasteIntentEnabled', false); onPasteIntentChange(false) }}>Off</button>
            </div>
          </div>

          <div className="gv-prefs-divider" />

          <div className="gv-prefs-row gv-prefs-row-col">
            <span className="gv-prefs-label">Workshop</span>
            <span className="gv-prefs-path">{prefs.lastWorkshopPath || '—'}</span>
            <button className="gv-prefs-action" onClick={async () => {
              const selected = await open({ directory: true, multiple: false, title: 'Open a workshop' })
              if (selected && typeof selected === 'string') { onWorkshopChange(selected); onClose() }
            }}>Open different workshop →</button>
          </div>

          {prefs.knownWorkshops && prefs.knownWorkshops.length > 1 && (
            <div className="gv-prefs-row gv-prefs-row-col">
              <span className="gv-prefs-label">Recent workshops</span>
              {prefs.knownWorkshops.filter(p => p !== prefs.lastWorkshopPath).map(p => (
                <button key={p} className="gv-prefs-action" onClick={() => { onWorkshopChange(p); onClose() }}>
                  {p.split('/').pop()} →
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="gv-prefs-footer">
          <span className="gv-prefs-maker"><strong>Gravitas</strong> · Built by POA</span>
          <span className="gv-prefs-copyright">© 2026 POA. All rights reserved.</span>
        </div>
      </div>
    </div>
  )
}
