import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, AudioLines, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, CloudOff, Disc3, Folder, FolderPlus, Grid2X2, HardDrive, Headphones, Keyboard, List, LoaderCircle, Menu, MoreHorizontal, Pause, Play, Plus, Search, Settings2, ShieldCheck, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Star, Tags, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react'
import Modal from './components/Modal'
import Waveform from './components/Waveform'
import ExportModal from './components/ExportModal'
import SampleInspector from './components/SampleInspector'
import { analyzeAudio, categoryFromLabel, encodeWav, formatSize, formatTime, modelInput, prepareAudio } from './lib/audio'
import { autoSampleName } from './lib/naming'
import { createStarter } from './lib/demo'
import { loadWorkspace, saveWorkspace } from './lib/db'
import { CATEGORIES, type Pack, type Sample, type Workspace } from './lib/types'

type View = 'pack' | 'all' | 'favorites'
type Dialog = 'import' | 'analyze' | 'export' | 'newPack' | 'editPack' | 'help' | 'settings' | 'delete' | 'bulkTags' | null
const emptyWorkspace: Workspace = { samples: [], packs: [], activePackId: '' }
let initialWorkspace: Promise<Workspace> | null = null
function initialize() { return initialWorkspace ||= loadWorkspace().then(saved => saved || createStarter()).catch(() => createStarter()) }
function Logo({ small = false }: { small?: boolean }) { return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><i /><i /><i /></span> }

export default function FoundryApp() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace), [loaded, setLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Saved on this device'), [view, setView] = useState<View>('pack')
  const [dialog, setDialog] = useState<Dialog>(null), [inspectId, setInspectId] = useState<string | null>(null)
  const [query, setQuery] = useState(''), [tab, setTab] = useState('all'), [category, setCategory] = useState('all'), [showFilters, setShowFilters] = useState(false)
  const [sort, setSort] = useState('added'), [grid, setGrid] = useState(false), [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState(''), [mobileNav, setMobileNav] = useState(false), [packMenu, setPackMenu] = useState(false)
  const [packName, setPackName] = useState(''), [packDescription, setPackDescription] = useState(''), [packAuthor, setPackAuthor] = useState('')
  const [bulkTags, setBulkTags] = useState(''), [defaultBits, setDefaultBits] = useState(() => { try { return localStorage.getItem('sf-default-bits') || '24' } catch { return '24' } })
  const [autoNameSamples, setAutoNameSamples] = useState(() => { try { return localStorage.getItem('sf-auto-name') !== 'off' } catch { return true } })
  const [importing, setImporting] = useState(false), [importProgress, setImportProgress] = useState(''), [importErrors, setImportErrors] = useState<string[]>([]), [dragOver, setDragOver] = useState(false)
  const [analyzing, setAnalyzing] = useState(false), [analysisProgress, setAnalysisProgress] = useState(''), [analysisIds, setAnalysisIds] = useState<string[]>([]), [analysisError, setAnalysisError] = useState(''), [modelConsent, setModelConsent] = useState(false)
  const [playerId, setPlayerId] = useState<string | null>(null), [playing, setPlaying] = useState(false), [currentTime, setCurrentTime] = useState(0), [playDuration, setPlayDuration] = useState(0), [volume, setVolume] = useState(0.7), [loop, setLoop] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null), searchRef = useRef<HTMLInputElement>(null), playerRef = useRef<HTMLAudioElement | null>(null), workerRef = useRef<Worker | null>(null), playToken = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 5000) }, [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const closeInspector = useCallback(() => setInspectId(null), [])
  useEffect(() => { let mounted = true; initialize().then(data => { if (mounted) { setWorkspace(data); setPlayerId(data.samples[0]?.id || null); setLoaded(true) } }); return () => { mounted = false } }, [])
  useEffect(() => {
    if (!loaded) return
    setSaveStatus('Saving locally…')
    const timer = setTimeout(() => { saveWorkspace(workspace).then(() => setSaveStatus('Saved on this device')).catch(() => { setSaveStatus('Storage unavailable'); notify('Local storage is unavailable or full. Export your pack to keep your work.') }) }, 400)
    return () => clearTimeout(timer)
  }, [workspace, loaded, notify])
  useEffect(() => () => { if (playerRef.current) { playerRef.current.pause(); URL.revokeObjectURL(playerRef.current.src) } workerRef.current?.terminate() }, [])
  useEffect(() => { if (playerRef.current) playerRef.current.volume = volume }, [volume])
  useEffect(() => { if (playerRef.current) playerRef.current.loop = loop }, [loop])

  const pack = workspace.packs.find(p => p.id === workspace.activePackId)
  const baseSamples = workspace.samples.filter(s => view === 'all' || (view === 'favorites' ? s.favorite : s.packId === workspace.activePackId))
  const readyCount = baseSamples.filter(s => s.status === 'ready').length, reviewCount = baseSamples.length - readyCount
  const totalDuration = baseSamples.reduce((n, s) => n + s.analysis.duration, 0), totalBytes = baseSamples.reduce((n, s) => n + s.blob.size, 0)
  const filtered = baseSamples.filter(s => (tab === 'all' || (tab === 'ready' ? s.status === 'ready' : s.status === 'review')) && (category === 'all' || s.category === category) && `${s.name} ${s.category} ${s.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'duration' ? b.analysis.duration - a.analysis.duration : sort === 'category' ? a.category.localeCompare(b.category) : b.createdAt - a.createdAt)
  const currentSample = workspace.samples.find(s => s.id === playerId), inspected = workspace.samples.find(s => s.id === inspectId)
  const selectedSamples = baseSamples.filter(s => selected.has(s.id))
  const updateSample = useCallback((sample: Sample) => setWorkspace(w => ({ ...w, samples: w.samples.map(s => {
    if (s.id !== sample.id) return s
    const next = { ...sample }
    if (next.autoNamed) { const taken = new Set(w.samples.filter(x => x.packId === next.packId && x.id !== next.id).map(x => x.name)); next.name = autoSampleName(next.originalName, next.bpm, next.category, taken) }
    return next
  }) })), [])
  const switchView = (next: View, packId?: string) => { setView(next); if (packId) setWorkspace(w => ({ ...w, activePackId: packId })); setSelected(new Set()); setQuery(''); setCategory('all'); setTab('all'); setMobileNav(false); setPackMenu(false) }
  const toggleSelect = (id: string) => setSelected(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next })
  const openAnalysis = (ids?: string[]) => { setInspectId(null); setAnalysisIds(ids || (selected.size ? selectedSamples : baseSamples).map(s => s.id)); setAnalysisError(''); setDialog('analyze') }
  async function playSample(sample: Sample, force = false) {
    if (playerRef.current && playerId === sample.id && !force) {
      if (playerRef.current.paused) { try { await playerRef.current.play(); setPlaying(true) } catch { notify('Playback could not start. Please try again.') } }
      else { playerRef.current.pause(); setPlaying(false) }
      return
    }
    const token = ++playToken.current
    if (playerRef.current) { playerRef.current.pause(); URL.revokeObjectURL(playerRef.current.src); playerRef.current = null }
    setPlayerId(sample.id); setCurrentTime(0); setPlayDuration(sample.analysis.duration); setPlaying(false)
    try {
      let blob = sample.blob
      if (sample.trim || sample.normalize || sample.fade) { const { channels, rate } = await prepareAudio(sample); blob = encodeWav(channels, rate) }
      if (token !== playToken.current) return
      const audio = new Audio(URL.createObjectURL(blob)); playerRef.current = audio; audio.volume = volume; audio.loop = loop
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime)
      audio.onloadedmetadata = () => setPlayDuration(audio.duration)
      audio.onended = () => setPlaying(false)
      audio.onerror = () => { setPlaying(false); notify('This file could not be played in your browser.') }
      await audio.play(); if (token === playToken.current) setPlaying(true)
    } catch { notify('Unable to preview this audio. Its format may not be supported.'); setPlaying(false) }
  }
  function nextSample(direction: number) { const list = filtered.length ? filtered : baseSamples; const i = list.findIndex(s => s.id === playerId); const sample = list[(i + direction + list.length) % list.length]; if (sample) void playSample(sample, true) }
  function seek(fraction: number) { if (playerRef.current && Number.isFinite(playerRef.current.duration)) { playerRef.current.currentTime = fraction * playerRef.current.duration; setCurrentTime(playerRef.current.currentTime) } }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select, button') || dialog || inspectId) return
      if (e.code === 'Space' && currentSample) { e.preventDefault(); void playSample(currentSample) }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key.toLowerCase() === 'i') setDialog('import')
      if (e.key === 'ArrowRight') nextSample(1)
      if (e.key === 'ArrowLeft') nextSample(-1)
      if (e.key === 'Escape') { setPackMenu(false); setMobileNav(false) }
    }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key)
  })
  async function importFiles(files: FileList | File[]) {
    if (importing || !pack) return
    setDialog('import'); setImporting(true); setImportErrors([]); setDragOver(false)
    const items = Array.from(files), newSamples: Sample[] = [], errors: string[] = []
    const takenNames = new Set(workspace.samples.filter(s => s.packId === pack.id).map(s => s.name))
    for (let i = 0; i < items.length; i++) {
      const file = items[i]; setImportProgress(`Analyzing ${i + 1} of ${items.length} · ${file.name}`)
      if (file.size > 100 * 1024 * 1024) { errors.push(`${file.name}: exceeds the 100 MB per-file limit.`); continue }
      if (!file.type.startsWith('audio/') && !/\.(wav|mp3|aif|aiff|flac|ogg|m4a|aac|webm)$/i.test(file.name)) { errors.push(`${file.name}: not a supported audio file.`); continue }
      if (workspace.samples.some(s => s.packId === pack.id && s.originalName === file.name && s.blob.size === file.size) || newSamples.some(s => s.originalName === file.name && s.blob.size === file.size)) { errors.push(`${file.name}: matching filename and size already in this pack.`); continue }
      try {
        const analysis = await analyzeAudio(file)
        const autoNamed = autoNameSamples
        const name = autoNamed ? autoSampleName(file.name, analysis.bpm, analysis.category, takenNames) : file.name
        if (autoNamed) takenNames.add(name)
        newSamples.push({ id: crypto.randomUUID(), packId: pack.id, name, originalName: file.name, blob: file, category: analysis.category, tags: analysis.tags, bpm: analysis.bpm, key: analysis.key, analysis, status: 'review', favorite: false, createdAt: Date.now(), trim: false, normalize: false, fade: false, autoNamed })
      } catch { errors.push(`${file.name}: could not decode. Try a standard PCM WAV, MP3, FLAC or OGG file.`) }
      await new Promise(r => setTimeout(r, 10))
    }
    if (newSamples.length) { setWorkspace(w => ({ ...w, samples: [...newSamples, ...w.samples] })); switchView('pack'); notify(`${newSamples.length} ${newSamples.length === 1 ? 'sample' : 'samples'} imported. ${autoNameSamples ? 'Each was auto-named from its detected tempo and genre. ' : ''}Audio measured; suggested metadata is ready to review.`) }
    setImporting(false); setImportProgress(''); setImportErrors(errors)
    if (!errors.length && newSamples.length) setDialog(null)
    if (inputRef.current) inputRef.current.value = ''
  }
  async function identifySounds() {
    if (analyzing) return
    setAnalyzing(true); setAnalysisError(''); setAnalysisProgress('Preparing the local audio model…')
    if (!workerRef.current) workerRef.current = new Worker(new URL('./lib/classifier.worker.ts', import.meta.url), { type: 'module' })
    let count = 0
    try {
      for (const id of analysisIds) {
        const sample = workspace.samples.find(s => s.id === id); if (!sample) continue
        setAnalysisProgress(`Listening to ${count + 1} of ${analysisIds.length} · ${sample.name}`)
        const audio = await modelInput(sample.blob)
        const predictions = await new Promise<{ label: string; score: number }[]>((resolve, reject) => {
          const worker = workerRef.current!
          const timeout = setTimeout(() => { worker.terminate(); workerRef.current = null; reject(new Error('Model download or inference timed out. Check your connection and try again.')) }, 240000)
          worker.onmessage = event => {
            const result = event.data
            if (result.id !== id) return
            if (result.type === 'progress') { const p = result.progress; if (p.status === 'progress') setAnalysisProgress(`Downloading model · ${p.file?.split('/').pop() || ''} · ${Math.round(p.progress || 0)}%`); else if (p.status === 'ready') setAnalysisProgress(`Identifying ${sample.name}…`) }
            if (result.type === 'result') { clearTimeout(timeout); resolve(result.predictions) }
            if (result.type === 'error') { clearTimeout(timeout); reject(new Error(result.message)) }
          }
          worker.onerror = () => { clearTimeout(timeout); worker.terminate(); workerRef.current = null; reject(new Error('Local model could not load. Check your connection or try a browser with WebAssembly support.')) }
          worker.postMessage({ id, audio }, [audio.buffer])
        })
        const top = predictions[0], reliable = top && top.score >= 0.35
        setWorkspace(w => ({ ...w, samples: w.samples.map((s): Sample => {
          if (s.id !== id) return s
          const category = reliable ? categoryFromLabel(top.label) : s.category
          const name = s.autoNamed ? autoSampleName(s.originalName, s.bpm, category, new Set(w.samples.filter(x => x.packId === s.packId && x.id !== id).map(x => x.name))) : s.name
          return { ...s, category, name, tags: [...new Set([...s.tags, ...predictions.filter(p => p.score >= 0.3).map(p => p.label.toLowerCase())])], status: 'review', analysis: { ...s.analysis, method: 'model', predictions } }
        }) }))
        count++
      }
      setAnalysisProgress(`${count} sounds identified. Review the model suggestions in sample details.`); notify(`Identification complete. ${count} samples are ready for your review.`)
    } catch (e) { setAnalysisError(e instanceof Error ? e.message : 'Sound identification failed. Signal measurements are still available.'); setAnalysisProgress('') }
    finally { setAnalyzing(false) }
  }
  function createPack() {
    if (!packName.trim()) return
    if (dialog === 'editPack' && pack) { setWorkspace(w => ({ ...w, packs: w.packs.map(p => p.id === pack.id ? { ...p, name: packName.trim(), description: packDescription, author: packAuthor } : p) })); notify('Pack details updated.') }
    else { const newPack: Pack = { id: crypto.randomUUID(), name: packName.trim(), description: packDescription, author: packAuthor, createdAt: Date.now() }; setWorkspace(w => ({ ...w, packs: [...w.packs, newPack], activePackId: newPack.id })); switchView('pack'); notify('A fresh canvas for your next collection.') }
    setDialog(null)
  }
  const openNewPack = () => { setPackName(''); setPackDescription(''); setPackAuthor(''); setPackMenu(false); setDialog('newPack') }
  const openEditPack = () => { if (pack) { setPackName(pack.name); setPackDescription(pack.description); setPackAuthor(pack.author); setPackMenu(false); setDialog('editPack') } }
  function deleteSelected() {
    if (playerId && selected.has(playerId)) { playerRef.current?.pause(); setPlaying(false); setPlayerId(null); playToken.current++ }
    setWorkspace(w => ({ ...w, samples: w.samples.filter(s => !selected.has(s.id)) })); notify(`${selected.size} samples removed from this workspace.`); setSelected(new Set()); setDialog(null)
  }
  function autoRenameSelected() {
    const taken = new Map<string, Set<string>>()
    for (const s of workspace.samples) { if (selected.has(s.id)) continue; let bucket = taken.get(s.packId); if (!bucket) { bucket = new Set(); taken.set(s.packId, bucket) } bucket.add(s.name) }
    let renamed = 0
    const samples = workspace.samples.map((s): Sample => {
      if (!selected.has(s.id)) return s
      renamed++
      let bucket = taken.get(s.packId)
      if (!bucket) { bucket = new Set(); taken.set(s.packId, bucket) }
      const name = autoSampleName(s.originalName, s.bpm, s.category, bucket)
      bucket.add(name)
      return { ...s, name, autoNamed: true }
    })
    setWorkspace(w => ({ ...w, samples }))
    notify(`${renamed} ${renamed === 1 ? 'sample' : 'samples'} renamed from BPM, original name, and genre. Your source files keep their own names.`)
    setSelected(new Set())
  }

  return <div className="app-shell" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); void importFiles(e.dataTransfer.files) } }}>
    {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); switchView('pack') }}><Logo /><span>sample<span className="brand-light">foundry</span><sup>&reg;</sup></span></a>
      <div className="workspace-switch"><span className="workspace-avatar">S</span><span>Personal workspace<small>Made for your sound.</small></span><button className="icon-button" title="Workspace settings" onClick={() => setDialog('settings')}><ChevronDown size={14} /></button></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="main-nav"><button className={view === 'all' ? 'active' : ''} onClick={() => switchView('all')}><AudioLines size={18} /><span>All samples</span><span className="nav-count">{workspace.samples.length}</span></button><button className={view === 'pack' ? 'active' : ''} onClick={() => switchView('pack')}><Folder size={18} /><span>Sample packs</span><span className="nav-count">{workspace.packs.length}</span></button><button className={view === 'favorites' ? 'active' : ''} onClick={() => switchView('favorites')}><Star size={18} /><span>Favorites</span>{workspace.samples.some(s => s.favorite) && <span className="nav-count">{workspace.samples.filter(s => s.favorite).length}</span>}</button></nav>
      <div className="sidebar-label packs-label">YOUR PACKS<button className="icon-button" aria-label="Create sample pack" onClick={openNewPack}><Plus size={14} /></button></div>
      <div className="pack-nav">{workspace.packs.map(p => <button key={p.id} className={p.id === workspace.activePackId && view === 'pack' ? 'current' : ''} onClick={() => switchView('pack', p.id)}><span className="pack-dot" /><span>{p.name}</span>{p.id === workspace.activePackId && view === 'pack' && <span className="tiny-dot" />}</button>)}<button className="new-pack-link" onClick={openNewPack}><Plus size={15} /><span>Create a new pack</span></button></div>
      <div className="sidebar-bottom">
        <div className="local-card">
          <div className="local-card-top"><span className="local-icon"><ShieldCheck size={18} /></span><span>Local by design.<br /><strong>Yours by default.</strong></span></div>
          <p>Your audio stays on your device.<br />No uploads. No compromises.</p>
          <div className="storage-line"><span>Local workspace</span><span>{formatSize(workspace.samples.reduce((n, s) => n + s.blob.size, 0))}</span></div>
          <div className="storage-bar"><span style={{ width: `${Math.min(100, Math.max(7, workspace.samples.reduce((n, s) => n + s.blob.size, 0) / 1073741824 * 100))}%` }} /></div>
        </div>
        <button className="bottom-nav" onClick={() => setDialog('settings')}><Settings2 size={17} /> Settings</button>
        <button className="bottom-nav" onClick={() => setDialog('help')}><CircleHelp size={17} /> Help &amp; shortcuts<span>?</span></button>
        <div className="sidebar-foot"><Logo small /><span>A little order. A lot of possibility.</span></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><Folder size={16} /><button onClick={() => switchView('pack')}>Sample packs</button><ChevronRight size={13} /><span>{view === 'pack' ? pack?.name || 'Your workspace' : view === 'all' ? 'All samples' : 'Favorites'}</span></div>
        <div className="topbar-right"><span className="saved-indicator"><span />{saveStatus}</span><span className="topbar-divider" /><button className="profile-button" onClick={() => setDialog('settings')} aria-label="Personal workspace settings">S</button></div>
      </header>
      <main className="workspace-main">
        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" />YOUR SOUNDS, WITH PURPOSE</div>
            <h1>{view === 'pack' ? pack?.name || 'Your sound starts here.' : view === 'all' ? 'The whole collection.' : 'Worth another listen.'}<span className="draft-pill">{view === 'pack' ? 'Draft pack' : `${baseSamples.length} samples`}</span></h1>
            <p>{view === 'pack' ? pack?.description || 'A new collection. A world of possibilities.' : view === 'all' ? 'Every idea, happy accident, and carefully captured detail.' : 'A home for the sounds you keep coming back to.'}</p>
          </div>
          <div className="heading-actions">
            <div className="pack-menu-wrap">
              <button className="button square" aria-label="Pack options" onClick={() => setPackMenu(!packMenu)}><MoreHorizontal size={19} /></button>
              {packMenu && <><div className="popover-dismiss" onClick={() => setPackMenu(false)} /><div className="popover pack-popover"><button onClick={openEditPack}><Settings2 size={15} />Edit pack details</button><button onClick={openNewPack}><FolderPlus size={15} />Create new pack</button><button onClick={() => { setPackMenu(false); setDialog('help') }}><CircleHelp size={15} />About this workspace</button></div></>}
            </div>
            <button className="button outline" onClick={() => { setImportErrors([]); setDialog('import') }}><Plus size={16} />Import sounds</button>
            <button className="button primary" disabled={!baseSamples.length} onClick={() => setDialog('export')}><ArrowDownToLine size={16} />Export pack<ArrowRight size={15} className="export-arrow" /></button>
          </div>
        </section>
        {view === 'pack' && <section className="pack-overview">
          <div className="cover-art"><img src="/images/organic-cover.png" alt="Sculptural forest-green mineral folds, sample pack artwork" /><span className="cover-series">THE FOUNDRY COLLECTION</span><div className="cover-text">{pack?.name || 'Untitled'}<span>VOL. 01 — SOUND EXPLORATIONS</span></div><span className="cover-logo"><Logo small /></span></div>
          <div className="pack-info">
            <div className="pack-meta-top"><span className="mini-pill"><span />WORK IN PROGRESS</span><span className="pack-edition">{pack?.starter ? 'STARTER COLLECTION' : 'INDEPENDENT COLLECTION'}</span></div>
            <h2>Raw sounds. Refined possibilities.</h2>
            <p>A little texture. A little character. A collection coming together.</p>
            <div className="pack-stats">
              <div><strong>{baseSamples.length}<span>samples</span></strong><small><AudioLines size={12} />{new Set(baseSamples.map(s => s.category)).size} sound categories</small></div>
              <div><strong>{formatTime(totalDuration)}<span>total audio</span></strong><small><Disc3 size={12} />{formatSize(totalBytes)} of inspiration</small></div>
              <div><strong>{readyCount}<span>ready to go</span></strong><small><span className="status-dot amber-dot" />{reviewCount ? `${reviewCount} need a closer look` : 'All details confirmed'}</small></div>
            </div>
            <div className="pack-progress-row"><div className="pack-progress"><span style={{ width: `${baseSamples.length ? readyCount / baseSamples.length * 100 : 0}%` }} /></div><span>{baseSamples.length ? Math.round(readyCount / baseSamples.length * 100) : 0}% pack-ready</span><button aria-label="What makes a pack ready?" onClick={() => setDialog('help')}><CircleHelp size={13} /></button></div>
          </div>
          <div className="overview-side"><span className="overview-icon"><Sparkles size={20} strokeWidth={1.5} /></span><h3>Less admin.<br />More making.</h3><p>Analyze your audio.<br />Find its character.<br />Give every sound a home.</p><button onClick={() => openAnalysis()} disabled={!baseSamples.length || analyzing}>{analyzing ? 'Identifying sounds…' : 'Analyze samples'}{analyzing ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={15} />}</button></div>
        </section>}
        <section className="library-section">
          <div className="library-heading">
            <div><h2>The sound collection<span>{baseSamples.length}</span></h2><p>Every detail, in its right place.</p></div>
            <div className="library-heading-right"><span className="local-caption"><CloudOff size={14} />Only on your device</span><button className="icon-button" title="Collection display settings" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={17} /></button></div>
          </div>
          <div className="collection-controls">
            <div className="tabs" role="tablist" aria-label="Sample status">
              <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All samples<span>{baseSamples.length}</span></button>
              <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>Needs review<span className="review-count">{reviewCount}</span></button>
              <button role="tab" aria-selected={tab === 'ready'} className={tab === 'ready' ? 'active' : ''} onClick={() => setTab('ready')}>Ready<span>{readyCount}</span></button>
            </div>
            <div className="view-buttons">
              <button className={!grid ? 'active' : ''} aria-label="List view" onClick={() => setGrid(false)}><List size={17} /></button>
              <button className={grid ? 'active' : ''} aria-label="Grid view" onClick={() => setGrid(true)}><Grid2X2 size={16} /></button>
            </div>
          </div>
          <div className="filter-bar">
            <div className="search-field"><Search size={16} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search sounds, tags, or a little inspiration…" aria-label="Search sounds" />{query ? <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button> : <kbd>/</kbd>}</div>
            <select className="category-select" aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            <button className={showFilters ? 'button filter-button filter-active' : 'button filter-button'} onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={14} />Filters{showFilters && <span className="tiny-dot" />}</button>
          </div>
          {showFilters && <div className="expanded-filters"><label>Sort collection<select value={sort} onChange={e => setSort(e.target.value)}><option value="added">Recently added</option><option value="name">Name · A to Z</option><option value="duration">Longest first</option><option value="category">Category</option></select></label><span>Showing {filtered.length} of {baseSamples.length} samples</span><button className="text-button" onClick={() => { setQuery(''); setCategory('all'); setSort('added'); setTab('all') }}>Reset filters</button></div>}
          {selected.size > 0 && <div className="selection-toolbar"><span><CheckCheck size={15} />{selected.size} selected</span><button onClick={() => { setWorkspace(w => ({ ...w, samples: w.samples.map(s => selected.has(s.id) ? { ...s, status: 'ready' } : s) })); notify('Selected metadata confirmed. Samples marked ready.'); setSelected(new Set()) }}><Check size={14} />Mark ready</button><button onClick={() => openAnalysis()}><Sparkles size={14} />Identify</button><button onClick={autoRenameSelected}><Tags size={14} />Auto-rename</button><button onClick={() => { setBulkTags(''); setDialog('bulkTags') }}>Add tags</button><button className="delete-selection" onClick={() => setDialog('delete')} aria-label="Delete selected samples"><Trash2 size={15} /></button><button onClick={() => setSelected(new Set())} aria-label="Clear selection"><X size={15} /></button></div>}
          {!loaded ? <div className="empty-state"><LoaderCircle size={28} className="spin" /><h3>Warming up the foundry…</h3><p>Preparing your local workspace and playable starter sounds.</p></div> : !filtered.length ? <div className="empty-state"><span className="empty-icon">{query || category !== 'all' ? <Search size={25} /> : view === 'favorites' ? <Star size={25} /> : <AudioLines size={28} />}</span><h3>{query || category !== 'all' ? 'No sounds in this corner.' : view === 'favorites' ? 'Keep your favorites close.' : tab === 'review' ? 'All caught up.' : tab === 'ready' ? 'A little review goes a long way.' : 'Great packs start with a sound.'}</h3><p>{query || category !== 'all' ? 'Try another search, or give your filters a little more room.' : view === 'favorites' ? 'Star a sample to save it here for another listen.' : tab === 'review' ? 'Every sample in this collection has been reviewed.' : tab === 'ready' ? 'Open a sample, check its metadata, and mark it ready.' : 'Drop your audio files here. We’ll take care of the details.'}</p><button className="button outline" onClick={() => { if (query || category !== 'all' || tab !== 'all') { setQuery(''); setCategory('all'); setTab('all') } else if (view === 'favorites') switchView('all'); else setDialog('import') }}>{query || category !== 'all' || tab !== 'all' ? 'Show all samples' : view === 'favorites' ? 'Explore your sounds' : 'Import your first sounds'}<ArrowRight size={15} /></button></div> : grid ? <div className="sample-grid">{filtered.map(sample => <article key={sample.id} className={`sample-card ${sample.id === playerId ? 'current' : ''}`}><div className="sample-card-top"><span className={`category-badge category-${sample.category.toLowerCase()}`}>{sample.category}</span><button className={`icon-button favorite-button ${sample.favorite ? 'is-favorite' : ''}`} aria-label={sample.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => updateSample({ ...sample, favorite: !sample.favorite })}><Star size={15} fill={sample.favorite ? 'currentColor' : 'none'} /></button></div><button className="card-wave" aria-label={`Play ${sample.name}`} onClick={() => void playSample(sample)}><Waveform values={sample.analysis.waveform} color="#93a288" /><span className="round-play">{playing && playerId === sample.id ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</span></button><button className="card-name" onClick={() => setInspectId(sample.id)}>{sample.name}</button><div className="card-tags">{sample.tags.slice(0, 3).join(' · ')}</div><footer><span className="mono">{formatTime(sample.analysis.duration)}</span><button className={`status-badge ${sample.status}`} onClick={() => setInspectId(sample.id)}><span />{sample.status === 'ready' ? 'Ready' : 'Needs review'}</button></footer></article>)}</div> : <div className="sample-table-scroll"><table className="sample-table"><thead><tr><th className="check-column"><input type="checkbox" aria-label="Select all visible samples" checked={filtered.length > 0 && filtered.every(s => selected.has(s.id))} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(s => s.id)) : new Set())} /></th><th className="sample-name-column"><button onClick={() => setSort(sort === 'name' ? 'added' : 'name')}>SAMPLE NAME<ChevronDown size={11} /></button></th><th className="wave-column">WAVEFORM</th><th className="type-column">CATEGORY</th><th className="key-column">KEY / BPM</th><th className="length-column"><button onClick={() => setSort(sort === 'duration' ? 'added' : 'duration')}>LENGTH<ChevronDown size={10} /></button></th><th className="status-column">STATUS</th><th className="row-actions-column" /></tr></thead><tbody>{filtered.map(sample => <tr key={sample.id} className={`${playerId === sample.id ? 'active-row' : ''} ${selected.has(sample.id) ? 'selected-row' : ''}`}><td><input type="checkbox" aria-label={`Select ${sample.name}`} checked={selected.has(sample.id)} onChange={() => toggleSelect(sample.id)} /></td><td><div className="sample-name-cell"><button className={`sample-play ${playerId === sample.id ? 'current' : ''}`} aria-label={`${playing && playerId === sample.id ? 'Pause' : 'Play'} ${sample.name}`} onClick={() => void playSample(sample)}>{playing && playerId === sample.id ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</button><button className="sample-name" onClick={() => setInspectId(sample.id)}><strong>{sample.name}</strong><span>{sample.tags.slice(0, 3).map((t, i) => <span key={t}>{i > 0 && <i>·</i>}{t}</span>)}</span></button></div></td><td className="wave-cell"><button aria-label={`Preview ${sample.name}`} onClick={() => void playSample(sample)}><Waveform values={sample.analysis.waveform} mini color={playerId === sample.id ? '#6f8b64' : '#adb6a3'} progress={playerId === sample.id && playDuration ? currentTime / playDuration : 0} /></button></td><td><span className={`category-badge category-${sample.category.toLowerCase()}`}>{sample.category}</span></td><td className="sample-key">{sample.key || '—'}{sample.bpm && <small>{sample.bpm} BPM</small>}</td><td className="sample-length mono">{formatTime(sample.analysis.duration)}</td><td><button className={`status-badge ${sample.status}`} onClick={() => setInspectId(sample.id)}><span />{sample.status === 'ready' ? 'Ready' : 'Needs review'}</button></td><td><div className="row-actions"><button className={`icon-button favorite-button ${sample.favorite ? 'is-favorite' : ''}`} aria-label={sample.favorite ? `Unfavorite ${sample.name}` : `Favorite ${sample.name}`} onClick={() => updateSample({ ...sample, favorite: !sample.favorite })}><Star size={14} fill={sample.favorite ? 'currentColor' : 'none'} /></button><button className="icon-button more-sample" aria-label={`Edit ${sample.name}`} onClick={() => setInspectId(sample.id)}><MoreHorizontal size={17} /></button></div></td></tr>)}</tbody></table></div>}
          <div className="collection-footer"><span>{filtered.length} samples<span className="footer-dot">·</span>{formatTime(filtered.reduce((n, s) => n + s.analysis.duration, 0))} total duration{pack?.starter && view === 'pack' && <span className="demo-label">Synthesized starter sounds</span>}</span><button onClick={() => setDialog('import')}><Plus size={13} />Add a little more sound</button></div><button className={`drop-strip ${dragOver ? 'drag-over' : ''}`} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); e.stopPropagation(); void importFiles(e.dataTransfer.files) }} onClick={() => setDialog('import')}><Upload size={17} /><span>Room for your next discovery.<strong>Drop audio files here or browse</strong></span><span className="drop-formats">WAV, AIFF, MP3, FLAC &amp; more<ArrowRight size={15} /></span></button>
        </section>
        <div className="workspace-caption"><span><Logo small />Built for the sounds only you could find.</span><span>LISTEN CLOSELY. MAKE SOMETHING GOOD.</span></div>
      </main>
      <footer className="player">
        <div className="now-playing">
          <div className="player-cover"><img src="/images/organic-cover.png" alt="Pack cover" />{playing && <AudioLines size={18} />}</div>
          <div><button onClick={() => currentSample && setInspectId(currentSample.id)}>{currentSample?.name || 'Find your next favorite sound'}</button><span>{currentSample ? `${currentSample.category} · ${currentSample.analysis.sampleRate / 1000} kHz · ${currentSample.analysis.bitDepth ? `${currentSample.analysis.bitDepth}-bit` : 'source audio'}` : 'Select a sample to listen'}</span></div>
          <button className={`icon-button player-star ${currentSample?.favorite ? 'is-favorite' : ''}`} aria-label="Favorite playing sample" disabled={!currentSample} onClick={() => currentSample && updateSample({ ...currentSample, favorite: !currentSample.favorite })}><Star size={15} fill={currentSample?.favorite ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="transport">
          <button className="icon-button" aria-label="Previous sample" onClick={() => nextSample(-1)} disabled={!baseSamples.length}><SkipBack size={16} fill="currentColor" /></button>
          <button className="round-play main-play" aria-label={playing ? 'Pause playback' : 'Play sample'} disabled={!currentSample} onClick={() => currentSample && void playSample(currentSample)}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
          <button className="icon-button" aria-label="Next sample" onClick={() => nextSample(1)} disabled={!baseSamples.length}><SkipForward size={16} fill="currentColor" /></button>
        </div>
        <div className="player-wave"><Waveform values={currentSample?.analysis.waveform || []} color="#c1c9b7" progress={playDuration ? currentTime / playDuration : 0} onSeek={seek} /><div className="player-times"><span>{formatTime(currentTime)}</span><span>{formatTime(playDuration || currentSample?.analysis.duration || 0)}</span></div></div>
        <div className="player-volume">
          <button className={`icon-button loop-button ${loop ? 'loop-active' : ''}`} title={loop ? 'Disable repeat' : 'Repeat sample'} aria-label="Toggle repeat" onClick={() => setLoop(!loop)}><Disc3 size={16} /></button>
          <button className="icon-button" aria-label={volume ? 'Mute audio' : 'Unmute audio'} onClick={() => setVolume(volume ? 0 : 0.7)}>{volume ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))} aria-label="Volume" />
        </div>
      </footer>
    </div>
    <input ref={inputRef} className="hidden-input" type="file" accept="audio/*,.wav,.aiff,.aif,.flac,.ogg,.mp3,.m4a" multiple onChange={e => e.target.files && void importFiles(e.target.files)} />
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
    {dialog === 'import' && <Modal title="Bring your sounds home." subtitle={`Add audio to ${pack?.name || 'your collection'}. All processing stays on this device.`} onClose={closeDialog}><button className={`import-dropzone ${dragOver ? 'drag-over' : ''}`} onClick={() => !importing && inputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); e.stopPropagation(); void importFiles(e.dataTransfer.files) }} disabled={importing}>{importing ? <LoaderCircle size={34} className="spin" /> : <Upload size={32} />}<strong>{importing ? 'Listening to the details…' : 'Drop your audio files here'}</strong><span>{importing ? importProgress : 'or click to browse your device'}</span><small>WAV, MP3, FLAC, OGG, M4A · AIFF where supported<br />Up to 100 MB per file · Multiple files welcome</small></button><div className="import-benefits"><div><AudioLines size={18} /><span><strong>Real audio measurements</strong><small>Duration, waveform, levels, silence &amp; signal-based suggestions.</small></span></div><div><ShieldCheck size={18} /><span><strong>Private from the first sample</strong><small>Audio lives in your browser’s local storage. Nothing is uploaded.</small></span></div></div>{importErrors.length > 0 && <div className="import-errors"><strong>A few files need attention</strong>{importErrors.map((error, i) => <p key={i}>{error}</p>)}</div>}<div className="notice"><Sparkles size={16} /><span>After importing, use <strong>Analyze samples</strong> to identify sound sources with an on-device audio model. Suggestions always need a human ear.</span></div><footer className="modal-footer"><span>Original files are never modified.</span><button className="button primary" disabled={importing} onClick={() => inputRef.current?.click()}><Plus size={15} />Choose audio files</button></footer></Modal>}
    {dialog === 'analyze' && <Modal title="Every sound has a story." subtitle={`Identify ${analysisIds.length} ${analysisIds.length === 1 ? 'sample' : 'samples'} without sending your audio anywhere.`} onClose={closeDialog}><div className="analysis-step"><span className="step-icon done"><Check size={20} /></span><div><h3>Signal analysis</h3><p>Waveform, duration, sample rate, channels, peak and RMS levels are measured during import. Tempo and root-note estimates appear only when sufficiently periodic.</p><span className="step-state">Already measured · No model needed</span></div></div><div className="analysis-step"><span className="step-icon"><Sparkles size={20} /></span><div><h3>Understand the sound</h3><p>A local Audio Spectrogram Transformer listens to the first 10 seconds and suggests sound sources, categories, and descriptive tags. Auto-named samples are renamed once more so the genre in the filename matches the model's answer.</p><span className="step-state neutral">AudioSet model · 527 sound classes · Runs on your CPU</span></div></div><div className="notice amber"><CircleHelp size={17} /><span>Sound identification is probabilistic, not ground truth. Results stay marked <strong>Needs review</strong>. Speech is classified, never transcribed.</span></div><label className="check-label rights"><input type="checkbox" checked={modelConsent} onChange={e => setModelConsent(e.target.checked)} disabled={analyzing} /><span>Download the model to my browser (about 90 MB, plus runtime files). Internet is needed on first use; cached files can be reused.</span></label>{analysisProgress && <div className="analysis-progress" role="status">{analyzing ? <LoaderCircle size={18} className="spin" /> : <CheckCircle2 size={18} />}<span>{analysisProgress}</span></div>}{analysisError && <div className="error-message">{analysisError}<br />Your signal measurements and files are unaffected.</div>}<footer className="modal-footer"><span><CloudOff size={14} />Your audio never leaves.</span><button className="button primary" disabled={!modelConsent || analyzing || !analysisIds.length} onClick={() => void identifySounds()}>{analyzing ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{analyzing ? 'Identifying…' : 'Identify sounds'}</button></footer></Modal>}
    {dialog === 'export' && pack && <ExportModal pack={view === 'pack' ? pack : { ...pack, name: view === 'all' ? 'My Sound Collection' : 'Favorite Sounds' }} samples={selected.size ? selectedSamples : baseSamples} onClose={closeDialog} onSuccess={notify} initialBits={defaultBits} />}
    {inspected && <SampleInspector key={inspected.id} sample={inspected} takenNames={workspace.samples.filter(s => s.packId === inspected.packId && s.id !== inspected.id).map(s => s.name)} onSave={updateSample} onClose={closeInspector} onPlay={sample => void playSample(sample, true)} onIdentify={() => openAnalysis([inspected.id])} />}
    {(dialog === 'newPack' || dialog === 'editPack') && <Modal title={dialog === 'newPack' ? 'Make room for a new idea.' : 'Give your collection a voice.'} subtitle="The beginning of something worth listening to." onClose={closeDialog}><form className="pack-form" onSubmit={e => { e.preventDefault(); createPack() }}><label>Pack name<input required maxLength={60} value={packName} onChange={e => setPackName(e.target.value)} placeholder="e.g. After Hours, City Fragments, Slow Motion" autoFocus /></label><label>Description<textarea rows={3} maxLength={240} value={packDescription} onChange={e => setPackDescription(e.target.value)} placeholder="A few words about the world inside this collection." /></label><label>Artist / label<input maxLength={80} value={packAuthor} onChange={e => setPackAuthor(e.target.value)} placeholder="Your artist or label name" /></label><footer className="modal-footer"><button className="button outline" type="button" onClick={closeDialog}>Cancel</button><button className="button primary" type="submit" disabled={!packName.trim()}>{dialog === 'newPack' ? <Plus size={16} /> : <Check size={16} />}{dialog === 'newPack' ? 'Create sample pack' : 'Save pack details'}</button></footer></form></Modal>}
    {dialog === 'delete' && <Modal title="Let these sounds go?" subtitle={`${selected.size} samples will be removed from the local workspace.`} onClose={closeDialog}><div className="notice amber"><Trash2 size={18} /><span>This can’t be undone here. Original files on your device are never deleted. Export anything you want to keep first.</span></div><footer className="modal-footer"><button className="button outline" onClick={closeDialog}>Keep samples</button><button className="button danger" onClick={deleteSelected}>Remove {selected.size} samples</button></footer></Modal>}
    {dialog === 'bulkTags' && <Modal title="A common thread." subtitle={`Add descriptive tags to ${selected.size} selected samples.`} onClose={closeDialog}><label>Tags, separated by commas<input value={bulkTags} onChange={e => setBulkTags(e.target.value)} placeholder="organic, warm, one-shot" autoFocus /></label><p className="input-hint">Existing tags will be preserved. Duplicates are removed.</p><footer className="modal-footer"><button className="button outline" onClick={closeDialog}>Cancel</button><button className="button primary" disabled={!bulkTags.trim()} onClick={() => { const tags = bulkTags.split(',').map(t => t.trim()).filter(Boolean); setWorkspace(w => ({ ...w, samples: w.samples.map(s => selected.has(s.id) ? { ...s, tags: [...new Set([...s.tags, ...tags])] } : s) })); setDialog(null); notify('Tags added to selected samples.') }}>Add tags<Check size={15} /></button></footer></Modal>}
    {dialog === 'settings' && <Modal title="Your own little foundry." subtitle="Simple preferences. No account needed." onClose={closeDialog}><div className="settings-card"><HardDrive size={22} /><div><h3>Local-first workspace</h3><p>{workspace.samples.length} samples · {workspace.packs.length} packs · {formatSize(workspace.samples.reduce((n, s) => n + s.blob.size, 0))}</p><small>Saved with IndexedDB in this browser. Clearing site data removes your workspace. Export regularly to keep a backup.</small></div></div><label>Default export bit depth<select value={defaultBits} onChange={e => { setDefaultBits(e.target.value); try { localStorage.setItem('sf-default-bits', e.target.value) } catch { notify('Browser preferences could not be saved.') } }}><option value="24">24-bit WAV · production-ready</option><option value="16">16-bit WAV · smaller file size</option></select></label><label className="check-label auto-name-setting"><input type="checkbox" checked={autoNameSamples} onChange={e => { const on = e.target.checked; setAutoNameSamples(on); try { localStorage.setItem('sf-auto-name', on ? 'on' : 'off') } catch { notify('Browser preferences could not be saved.') } }} /><span>Auto-name samples after analysis<small>Samples are named <strong>BPM · original name · genre</strong> (for example <em>124BPM_Morning_Drust_Texture.wav</em>) on import and again after Identify. Names stay linked until you edit one by hand.</small></span></label><div className="settings-card compact"><ShieldCheck size={20} /><div><h3>Audio privacy, without compromise.</h3><p>Audio processing, model inference, and ZIP export happen on this device. Model files download from Hugging Face only when you opt in. Your audio is never sent to a server.</p></div></div><footer className="modal-footer"><span>Preferences save automatically.</span><button className="button primary" onClick={closeDialog}><Check size={16} />All set</button></footer></Modal>}
    {dialog === 'help' && <Modal title="From a folder to a finished pack." subtitle="A little order. A lot of possibility." onClose={closeDialog} wide><div className="help-steps"><div><span>01</span><h3>Bring it in.</h3><p>Import or drop audio files. We measure the real signal, auto-name each sound by BPM, original name, and genre, and keep original files safe in your local browser storage.</p></div><div><span>02</span><h3>Listen closer.</h3><p>Use Analyze samples for on-device sound identification — names follow the confirmed genre. Open any filename to correct metadata, rebuild its auto-name, trim silence, normalize, or add micro-fades.</p></div><div><span>03</span><h3>Make it a pack.</h3><p>Confirm metadata to mark a sound ready. Export category folders, prepared WAVs, embedded tags, a catalog, artwork, and a license.</p></div></div><div className="help-note"><Headphones size={20} /><div><strong>Your ears have the final say.</strong><p>Sound classes, root notes and tempo are suggestions, not verified facts. “Ready” means you’ve reviewed a sample. The starter collection is synthesized demo audio, not field recordings. Nothing is automatically published or sold.</p></div></div><div className="shortcut-heading"><Keyboard size={17} /><h3>Less clicking. More listening.</h3></div><div className="shortcuts"><span>Play / pause<kbd>space</kbd></span><span>Find a sound<kbd>/</kbd></span><span>Import audio<kbd>I</kbd></span><span>Previous / next<kbd>← →</kbd></span><span>Close dialog<kbd>esc</kbd></span></div><footer className="modal-footer"><span><ShieldCheck size={14} />Export regularly. Browser storage is not a backup.</span><button className="button primary" onClick={closeDialog}>Let’s make something<ArrowRight size={15} /></button></footer></Modal>}
  </div>
}
