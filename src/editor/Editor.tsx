import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { EditorView, keymap, ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { gravitas } from './theme'
import { wikilinkPlugin } from './plugins/wikilinks'
import { openQuestionPlugin } from './plugins/openQuestions'
import { typewriterExtensions, setProgrammatic } from './plugins/typewriter'
import { focusGradient } from './plugins/activeLine'
import { playKeySound } from './plugins/typewriterSound'
import { markdownRenderPlugin } from './plugins/markdownRender'
import { createPasteIntentPlugin } from './plugins/pasteIntent'
import { processBlockPlugin } from './plugins/processBlock'
import { createScratchPromotePlugin, scratchReadonlyExtension } from './plugins/scratchPromote'
import { exportNoteAsPdf } from '../export/exportPdf'
import './pasteBanner.css'
import './Editor.css'

interface Note { title:string; path:string; content:string; meta:{date:string;tags:string[];type:string;words:number} }
export interface EditorHandle { appendEntry:(text:string)=>void; insertAt:(pos:number,text:string)=>void; getView:()=>EditorView|null }
interface EditorProps { note:Note; onNavOpen:()=>void; onContentChange?:(content:string)=>void; onTitleChange?:(newTitle:string)=>void; saveState?:'set'|'setting'|'unsaved'; soundEnabled?:boolean; pasteIntentEnabled?:boolean; isScratch?:boolean; isNewNote?:boolean; onNewNoteDone?:()=>void; onPromote?:(content:string,insertAfterPos:number)=>void; onDeleteEntry?:(dividerLineNo:number)=>void }
function countWords(text:string){return text.trim().split(/\s+/).filter(Boolean).length}
function readingTime(words:number){const mins=Math.ceil(words/200);return mins<1?'< 1 min':`~${mins} min read`}
function pathTitle(path:string){const raw=path.split('/').pop()?.replace(/\.md$/,'')??'';return raw&&raw!=='untitled'?raw:''}

const Editor=forwardRef<EditorHandle,EditorProps>(function Editor({note,onNavOpen,onContentChange,onTitleChange,saveState='set',soundEnabled=false,pasteIntentEnabled=true,isScratch=false,isNewNote=false,onNewNoteDone,onPromote,onDeleteEntry},ref){
 const editorRef=useRef<HTMLDivElement>(null),viewRef=useRef<EditorView|null>(null)
 const [words,setWords]=useState(countWords(note.content)),[chars,setChars]=useState(note.content.length),[uiVisible,setUiVisible]=useState(false),[shortcutsOpen,setShortcutsOpen]=useState(false)
 const uiTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null),activeKeyRef=useRef(''),soundEnabledRef=useRef(soundEnabled),pasteIntentEnabledRef=useRef(pasteIntentEnabled),isScratchRef=useRef(isScratch)
 const [editingTitle,setEditingTitle]=useState(false),[titleDraft,setTitleDraft]=useState(''),titleInputRef=useRef<HTMLInputElement>(null),[pasteBannerVisible,setPasteBannerVisible]=useState(false),[entering,setEntering]=useState(false)
 const onPromoteRef=useRef(onPromote),onDeleteEntryRef=useRef(onDeleteEntry)
 useEffect(()=>{soundEnabledRef.current=soundEnabled},[soundEnabled]);useEffect(()=>{pasteIntentEnabledRef.current=pasteIntentEnabled},[pasteIntentEnabled]);useEffect(()=>{isScratchRef.current=isScratch},[isScratch]);useEffect(()=>{onPromoteRef.current=onPromote},[onPromote]);useEffect(()=>{onDeleteEntryRef.current=onDeleteEntry},[onDeleteEntry])
 useImperativeHandle(ref,()=>({appendEntry(text){const v=viewRef.current;if(!v)return;const n=v.state.doc.length;v.dispatch({changes:{from:n,insert:text},selection:{anchor:n+text.length},scrollIntoView:true})},insertAt(pos,text){viewRef.current?.dispatch({changes:{from:pos,insert:text}})},getView(){return viewRef.current}}))
 const showUI=(e:React.MouseEvent)=>{if(e.movementX===0&&e.movementY===0)return;setUiVisible(true);if(uiTimerRef.current)clearTimeout(uiTimerRef.current);uiTimerRef.current=setTimeout(()=>setUiVisible(false),2500)}
 const displayTitle=pathTitle(note.path)||note.title
 const handleTitleClick=()=>{if(!onTitleChange)return;setTitleDraft(displayTitle);setEditingTitle(true);setTimeout(()=>titleInputRef.current?.select(),0)}
 const handleTitleCommit=()=>{setEditingTitle(false);const t=titleDraft.trim();if(!t||t===displayTitle)return;const current=viewRef.current?.state.doc.toString()??note.content;onContentChange?.(current);setTimeout(()=>onTitleChange?.(t),900)}
 const handleTitleKeyDown=(e:React.KeyboardEvent)=>{if(e.key==='Enter')handleTitleCommit();if(e.key==='Escape')setEditingTitle(false)}
 const pastePluginRef=useRef<ReturnType<typeof createPasteIntentPlugin>|null>(null);if(!pastePluginRef.current)pastePluginRef.current=createPasteIntentPlugin(s=>setPasteBannerVisible(s.active),pasteIntentEnabledRef)
 const promotePluginRef=useRef<ReturnType<typeof createScratchPromotePlugin>|null>(null);if(!promotePluginRef.current)promotePluginRef.current=createScratchPromotePlugin(onPromoteRef,onDeleteEntryRef)
 useEffect(()=>{if(!editorRef.current)return;const state=EditorState.create({doc:note.content,extensions:[history(),keymap.of([...defaultKeymap,...historyKeymap]),markdown(),gravitas,wikilinkPlugin,openQuestionPlugin,markdownRenderPlugin,processBlockPlugin,focusGradient,...(pastePluginRef.current?[pastePluginRef.current]:[]),...(promotePluginRef.current?[promotePluginRef.current]:[]),scratchReadonlyExtension(()=>isScratchRef.current),...typewriterExtensions,EditorView.domEventHandlers({keydown(e){if(!soundEnabledRef.current)return false;if(e.key.length===1||e.key==='Enter'||e.key==='Backspace'||e.key==='Delete')playKeySound();return false}}),EditorView.updateListener.of((u:ViewUpdate)=>{if(u.docChanged){const text=u.state.doc.toString();setWords(countWords(text));setChars(text.length);onContentChange?.(text)}}),EditorView.lineWrapping]});const v=new EditorView({state,parent:editorRef.current});viewRef.current=v;activeKeyRef.current=note.path;const end=v.state.doc.length;v.dispatch({selection:{anchor:end},scrollIntoView:false});requestAnimationFrame(()=>{v.scrollDOM.scrollTop=v.scrollDOM.scrollHeight});v.focus();return()=>v.destroy()},[])
 useEffect(()=>{const v=viewRef.current;if(!v||note.path===activeKeyRef.current)return;activeKeyRef.current=note.path;setProgrammatic(true);v.dispatch({changes:{from:0,to:v.state.doc.length,insert:note.content},scrollIntoView:false});setWords(countWords(note.content));setChars(note.content.length);requestAnimationFrame(()=>{const end=v.state.doc.length;v.dispatch({selection:{anchor:end},scrollIntoView:false});v.scrollDOM.scrollTop=v.scrollDOM.scrollHeight;requestAnimationFrame(()=>{setProgrammatic(false);v.focus()})});if(isNewNote){setEntering(true);const t=setTimeout(()=>setEntering(false),300);if(!isScratch){setTitleDraft(pathTitle(note.path)||note.title);setEditingTitle(true);setTimeout(()=>titleInputRef.current?.select(),80)}onNewNoteDone?.();return()=>clearTimeout(t)}},[note.path,note.content])
 const saveLabel=saveState==='set'?'Set':saveState==='setting'?'Setting…':'Not set'
 const handleExportPdf=()=>{const content=viewRef.current?.state.doc.toString()??note.content;exportNoteAsPdf(displayTitle,content)}
 const mod=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl'
 return <div className={`gv-editor ${uiVisible||shortcutsOpen?'ui-visible':''}`} onMouseMove={showUI}>
  <div className="gv-topbar"><button className="gv-nav-toggle" onClick={onNavOpen} title="Navigate"><span/><span/><span/></button><div className="gv-topbar-actions"><span className="gv-mode-tab active">Write</span><span className="gv-mode-tab">Read</span><span className="gv-mode-tab">Audit</span></div></div>
  <div className={`gv-paste-banner ${pasteBannerVisible?'visible':''}`}><span><span className="gv-paste-banner-key">Q</span> quote</span><span className="gv-paste-banner-sep">·</span><span><span className="gv-paste-banner-key">P</span> process</span><span className="gv-paste-banner-sep">·</span><span>any key plain</span></div>
  <div className={`gv-stage ${entering?'gv-entering':''}`}><div className="gv-col"><div className="gv-header">{isScratch?<div className="gv-scratch-label">scratch</div>:editingTitle?<input ref={titleInputRef} className="gv-title gv-title-input" value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} onBlur={handleTitleCommit} onKeyDown={handleTitleKeyDown}/>:<h1 className={`gv-title ${onTitleChange?'gv-title-editable':''}`} onClick={handleTitleClick}>{displayTitle}</h1>}{!isScratch&&<div className="gv-meta"><span>{note.meta.date}</span>{note.meta.tags.map(t=><span key={t} className="gv-tag">{t}</span>)}<span className="gv-type-badge">{note.meta.type}</span></div>}</div><div className="gv-cm-wrap" ref={editorRef}/></div></div></div>
  {shortcutsOpen&&<div className="gv-shortcuts" onMouseLeave={()=>setShortcutsOpen(false)}><span><kbd>{mod}N</kbd> new note</span><span><kbd>{mod}S</kbd> scratch</span><span><kbd>{mod}D</kbd> today</span><span><kbd>{mod}K</kbd> navigate</span><span><kbd>{mod},</kbd> preferences</span><span><kbd>Esc</kbd> close</span></div>}
  <div className="gv-statusbar"><div className="gv-statusbar-stats"><span className="gv-stat"><span className={`gv-stat-dot ${saveState}`}/>{saveLabel}</span><span className="gv-stat">{words} words</span><span className="gv-stat">{chars} chars</span><span className="gv-stat">{readingTime(words)}</span></div><div className="gv-statusbar-actions"><button className="gv-shortcuts-btn" onClick={()=>setShortcutsOpen(v=>!v)}>Shortcuts</button>{!isScratch&&<button className="gv-export-pdf" onClick={handleExportPdf} title="Export this note as PDF">Export PDF</button>}</div></div>
 </div>
})
export default Editor
