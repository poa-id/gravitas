import { useState, useEffect, useRef } from 'react'
import { readTextFile } from '@tauri-apps/plugin-fs'
import type { Workshop, NoteFile } from '../workshop/workshopAdapter'
import { showNoteContextMenu } from './contextMenu'
import { trashNote, moveNote, revealInFinder, createShelf, renameShelf, trashShelf } from '../workshop/fileManagement'
import { renameNoteOnDisk } from '../workshop/noteCreation'
import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu'
import type { Shelf } from '../workshop/workshopAdapter'
import './Nav.css'

interface NavProps {
  open: boolean
  onClose: () => void
  onNoteSelect: (note: NoteFile) => void
  onTodayFolio: () => void
  onScratchOpen?: () => void
  workshop: Workshop
  onNoteDeleted: (note: NoteFile) => void
  onNoteMoved: (note: NoteFile, newNote: NoteFile) => void
  onRenamed: (oldNote: NoteFile, newNote: NoteFile, humanTitle?: string) => void
  onRefresh: () => Promise<void>
  noteTitles: Map<string, string>
}

function localDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatFolioName(name: string): string {
  const today = localDateStr(new Date())
  const yesterday = localDateStr(new Date(Date.now() - 86400000))
  if (name === today) return 'Today'
  if (name === yesterday) return 'Yesterday'
  const d = new Date(name + 'T12:00:00')
  if (!isNaN(d.getTime())) return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  return name
}

export function formatNoteName(name: string): string {
  // New Gravitas filenames preserve the human title. Only humanize old slug-style names.
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name)) {
    const words = name.replace(/-/g, ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
  }
  return name.charAt(0).toUpperCase() + name.slice(1)
}

interface NoteSignals { hasQuestions: boolean; hasProcess: boolean }
const signalCache = new Map<string, NoteSignals>()
async function scanNote(path: string): Promise<NoteSignals> {
  if (signalCache.has(path)) return signalCache.get(path)!
  try {
    const content = await readTextFile(path)
    const lines = content.split('\n')
    const signals = { hasQuestions: lines.some(l => l.startsWith('?? ')), hasProcess: lines.some(l => l.startsWith('>> ')) }
    signalCache.set(path, signals)
    return signals
  } catch { return { hasQuestions: false, hasProcess: false } }
}
export function invalidateSignalCache(path: string) { signalCache.delete(path) }
function NoteSignalDots({ signals }: { signals: NoteSignals | null }) { if (!signals) return null; return <span className="gv-nav-signals">{signals.hasQuestions&&<span className="gv-nav-signal gv-nav-signal-q" title="Has open questions">?</span>}{signals.hasProcess&&<span className="gv-nav-signal gv-nav-signal-p" title="Has text to process">&gt;&gt;</span>}</span> }
let dragNote: NoteFile | null = null

function NoteRow({ note, label, onSelect, onContext, onDragEnd, signals }: { note:NoteFile;label:string;onSelect:()=>void;onContext:(e:React.MouseEvent)=>void;onDragEnd:()=>void;signals:NoteSignals|null }) {
 return <div className="gv-nav-note" draggable onDragStart={e=>{dragNote=note;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',note.path)}} onDragEnd={()=>{dragNote=null;onDragEnd()}} onClick={onSelect} onContextMenu={onContext}><span className="gv-nav-note-name">{label}</span><NoteSignalDots signals={signals}/></div>
}

export default function Nav({open,onClose,onNoteSelect,onTodayFolio,onScratchOpen,workshop,onNoteDeleted,onNoteMoved,onRenamed,onRefresh,noteTitles}:NavProps){
 const [collapsed,setCollapsed]=useState<Set<string>>(new Set()),[signals,setSignals]=useState<Map<string,NoteSignals>>(new Map()),[search,setSearch]=useState(''),searchRef=useRef<HTMLInputElement>(null),[renaming,setRenaming]=useState<{note:NoteFile;value:string}|null>(null)
 useEffect(()=>{if(!open)return;Promise.all(workshop.allNotes.map(async n=>[n.path,await scanNote(n.path)] as const)).then(entries=>setSignals(new Map(entries)));setTimeout(()=>searchRef.current?.focus(),120)},[open,workshop])
 useEffect(()=>{if(!open)setSearch('')},[open])
 const label=(n:NoteFile)=>noteTitles.get(n.path)??formatNoteName(n.name)
 const filtered=search.trim()?workshop.allNotes.filter(n=>label(n).toLowerCase().includes(search.toLowerCase())):null
 const doRename=async()=>{if(!renaming)return;const title=renaming.value.trim();const old=renaming.note;setRenaming(null);if(!title||title===label(old))return;const renamed=await renameNoteOnDisk(old,title,workshop.path);if(renamed)onRenamed(old,renamed,title)}
 const noteMenu=async(e:React.MouseEvent,n:NoteFile)=>{e.preventDefault();await showNoteContextMenu({note:n,shelves:workshop.shelves,onRename:()=>setRenaming({note:n,value:label(n)}),onMove:async shelf=>{const moved=await moveNote(n,shelf,workshop.path);if(moved)onNoteMoved(n,moved)},onReveal:()=>revealInFinder(n.path),onDelete:async()=>{await trashNote(n);onNoteDeleted(n)}})}
 const shelfMenu=async(e:React.MouseEvent,s: Shelf)=>{e.preventDefault();const renameItem=await MenuItem.new({text:'Rename',action:async()=>{const next=prompt('Shelf name',s.name);if(next?.trim()){await renameShelf(s,next.trim(),workshop.path);await onRefresh()}}});const del=await MenuItem.new({text:'Delete',action:async()=>{await trashShelf(s,workshop.path);await onRefresh()}});const sep=await PredefinedMenuItem.new({item:'Separator'});const menu=await Menu.new({items:[renameItem,sep,del]});await menu.popup()}
 const dropShelf=async(e:React.DragEvent,shelf:string[])=>{e.preventDefault();if(!dragNote)return;const old=dragNote;const moved=await moveNote(old,shelf,workshop.path);if(moved)onNoteMoved(old,moved);dragNote=null}
 const toggle=(name:string)=>setCollapsed(prev=>{const n=new Set(prev);n.has(name)?n.delete(name):n.add(name);return n})
 return <><div className={`gv-nav-backdrop ${open?'open':''}`} onClick={onClose}/><aside className={`gv-nav ${open?'open':''}`}><div className="gv-nav-head"><input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a note…"/><button onClick={onClose}>×</button></div><div className="gv-nav-body">{filtered?<div className="gv-nav-section">{filtered.map(n=><NoteRow key={n.path} note={n} label={n.shelf.includes('folio')?formatFolioName(n.name):label(n)} onSelect={()=>{onNoteSelect(n);onClose()}} onContext={e=>noteMenu(e,n)} onDragEnd={()=>{}} signals={signals.get(n.path)??null}/>)}</div>:<><div className="gv-nav-section gv-nav-fixed"><button className="gv-nav-special" onClick={()=>{onTodayFolio();onClose()}}>Today</button>{onScratchOpen&&<button className="gv-nav-special" onClick={()=>{onScratchOpen();onClose()}}>Scratch</button>}</div>{workshop.rootNotes.length>0&&<div className="gv-nav-section"><div className="gv-nav-section-label">Notes</div>{workshop.rootNotes.map(n=>renaming?.note.path===n.path?<input key={n.path} className="gv-nav-rename" autoFocus value={renaming.value} onChange={e=>setRenaming({...renaming,value:e.target.value})} onBlur={doRename} onKeyDown={e=>{if(e.key==='Enter')doRename();if(e.key==='Escape')setRenaming(null)}}/>:<NoteRow key={n.path} note={n} label={label(n)} onSelect={()=>{onNoteSelect(n);onClose()}} onContext={e=>noteMenu(e,n)} onDragEnd={()=>{}} signals={signals.get(n.path)??null}/>)}</div>}{workshop.shelves.map(s=><div className="gv-nav-section" key={s.name} onDragOver={e=>e.preventDefault()} onDrop={e=>dropShelf(e,[s.name])}><div className="gv-nav-shelf-head" onContextMenu={e=>shelfMenu(e,s)} onClick={()=>toggle(s.name)}><span>{collapsed.has(s.name)?'›':'⌄'}</span><span>{s.name}</span></div>{!collapsed.has(s.name)&&s.notes.map(n=><NoteRow key={n.path} note={n} label={label(n)} onSelect={()=>{onNoteSelect(n);onClose()}} onContext={e=>noteMenu(e,n)} onDragEnd={()=>{}} signals={signals.get(n.path)??null}/>)}</div>)}</>}</div><div className="gv-nav-foot"><button onClick={async()=>{const name=prompt('Shelf name');if(name?.trim()){await createShelf(workshop.path,name.trim());await onRefresh()}}}>+ shelf</button></div></aside></>
}
