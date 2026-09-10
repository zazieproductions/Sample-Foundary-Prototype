import { useState } from 'react'
import JSZip from 'jszip'
import { Check, Download, FolderTree, FileAudio, Image, LoaderCircle, ShieldCheck, AlertCircle } from 'lucide-react'
import Modal from './Modal'
import { encodeWav, prepareAudio, safeName, formatSize } from '../lib/audio'
import type { Pack, Sample } from '../lib/types'

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
export default function ExportModal({ pack, samples, onClose, onSuccess, initialBits = '24' }: { pack: Pack; samples: Sample[]; onClose: () => void; onSuccess: (text: string) => void; initialBits?: string }) {
  const [bits, setBits] = useState(initialBits), [rate, setRate] = useState('source')
  const [prefix, setPrefix] = useState('SF'), [folders, setFolders] = useState(true), [artwork, setArtwork] = useState(true)
  const [rights, setRights] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState('')
  const [license, setLicense] = useState('royalty-free'), [finished, setFinished] = useState<Blob | null>(null)
  const review = samples.filter(s => s.status === 'review').length
  async function build() {
    setBusy(true); setError('')
    try {
      const zip = new JSZip(), manifest: Record<string, unknown>[] = []
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i]; setProgress(`Preparing sample ${i + 1} of ${samples.length}…`)
        const { channels, rate: sampleRate } = await prepareAudio(sample, rate === 'source' ? undefined : Number(rate))
        const filename = `${prefix ? safeName(prefix) + '_' : ''}${String(i + 1).padStart(3, '0')}_${safeName(sample.name)}.wav`
        const path = `${folders ? sample.category + '/' : ''}${filename}`
        const wav = encodeWav(channels, sampleRate, Number(bits), { INAM: sample.name, IART: pack.author, IPRD: pack.name, IGNR: sample.category, IKEY: sample.tags.join(', '), ICMT: `${sample.key ? 'Estimated/confirmed note: ' + sample.key + '. ' : ''}${sample.bpm ? 'BPM: ' + sample.bpm + '. ' : ''}Source: ${sample.originalName}. Metadata: ${sample.status}.` })
        zip.file(path, wav)
        manifest.push({ file: path, name: sample.name, originalName: sample.originalName, category: sample.category, tags: sample.tags.join('; '), bpm: sample.bpm, key: sample.key, duration: +(channels[0].length / sampleRate).toFixed(3), sampleRate, bitDepth: Number(bits), channels: channels.length, peakDbSource: +sample.analysis.peakDb.toFixed(2), rmsDbSource: +sample.analysis.rmsDb.toFixed(2), analysisMethod: sample.analysis.method, reviewStatus: sample.status, normalized: sample.normalize, trimmed: sample.trim, faded: sample.fade, predictions: sample.analysis.predictions || [] })
      }
      setProgress('Writing metadata and packaging…')
      zip.file('metadata.json', JSON.stringify({ pack: { name: pack.name, author: pack.author, description: pack.description }, exportedAt: new Date().toISOString(), samples: manifest }, null, 2))
      const columns = Object.keys(manifest[0] || {}).filter(k => k !== 'predictions')
      const csv = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
      zip.file('metadata.csv', [columns.join(','), ...manifest.map(row => columns.map(k => csv(row[k])).join(','))].join('\r\n'))
      zip.file('README.txt', `${pack.name}\n${'='.repeat(pack.name.length)}\nBy ${pack.author || 'Independent creator'}\n\n${pack.description}\n\n${samples.length} WAV samples · ${bits}-bit PCM\nEmbedded RIFF INFO metadata, JSON and CSV catalog included.\n${review ? `NOTE: ${review} samples have metadata suggestions awaiting manual review.\n` : ''}\nCreated with Sample Foundry. Audio was prepared locally on your device.\n${pack.starter ? '\nThis pack contains synthesized demonstration sounds, not real field recordings.\n' : ''}\nSee LICENSE.txt for usage terms.\n`)
      zip.file('LICENSE.txt', license === 'royalty-free' ? `${pack.name} — Royalty-free sample license\n\nThe pack creator grants the purchaser a non-exclusive license to use these samples in original musical compositions, audiovisual productions, performances, and sound designs, including commercial work.\n\nThe standalone samples may not be resold, sublicensed, redistributed, or included in competing sample libraries. No exclusive rights are granted.\n\nThe creator is responsible for ensuring they hold the necessary rights. This template is not legal advice.\n` : `${pack.name} — All rights reserved\n\nCopyright ${new Date().getFullYear()} ${pack.author || 'the pack creator'}.\nNo rights are granted without the creator's written permission.\n`)
      if (artwork) { const response = await fetch('/images/organic-cover.png'); if (!response.ok) throw new Error('Cover artwork could not be loaded. Try exporting without artwork.'); zip.file('artwork.png', await response.blob()) }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } })
      setFinished(blob); downloadBlob(blob, `${safeName(pack.name)}.zip`); onSuccess('Your sample pack is ready. ZIP download started.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed. Please try again.') }
    finally { setBusy(false) }
  }
  return <Modal title={finished ? 'Ready for the world.' : 'Package your sound.'} subtitle={finished ? 'Your organized, metadata-rich sample pack is ready.' : 'A proper sample pack, down to the last detail.'} onClose={onClose} wide>
    {finished ? <div className="export-success"><div className="success-icon"><Check size={30} /></div><h3>{pack.name}</h3><p>{samples.length} samples · {formatSize(finished.size)} · WAV + metadata + license</p><button className="button primary" onClick={() => downloadBlob(finished, `${safeName(pack.name)}.zip`)}><Download size={16} /> Download pack again</button><button className="button subtle" onClick={onClose}>Back to the workspace</button></div> : <><div className="export-layout"><div className="export-form"><div className="field-row"><label>Audio format<select value={bits} onChange={e => setBits(e.target.value)} disabled={busy}><option value="24">WAV · 24-bit PCM</option><option value="16">WAV · 16-bit PCM</option></select></label><label>Sample rate<select value={rate} onChange={e => setRate(e.target.value)} disabled={busy}><option value="source">Preserve source</option><option value="44100">44.1 kHz</option><option value="48000">48 kHz</option></select></label></div><label>Filename prefix<input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. SF" disabled={busy} /></label><p className="input-hint">{prefix || 'SF'}_001_{safeName(samples[0]?.name || 'sample')}.wav</p><label>License template<select value={license} onChange={e => setLicense(e.target.value)} disabled={busy}><option value="royalty-free">Royalty-free · no standalone redistribution</option><option value="reserved">All rights reserved</option></select></label><label className="check-label"><input type="checkbox" checked={folders} onChange={e => setFolders(e.target.checked)} disabled={busy} /> Organize into category folders</label><label className="check-label"><input type="checkbox" checked={artwork} onChange={e => setArtwork(e.target.checked)} disabled={busy} /> Include pack artwork</label></div><div className="package-preview"><span className="eyebrow">INSIDE YOUR PACK</span><div className="folder-title"><FolderTree size={17} /> {safeName(pack.name)}/</div><div className="file-tree"><p><FileAudio size={15} /> {samples.length} prepared WAV files</p><p><Check size={15} /> Embedded audio metadata</p><p><Check size={15} /> metadata.csv + metadata.json</p><p><Check size={15} /> README + license</p>{artwork && <p><Image size={15} /> artwork.png</p>}</div><div className="privacy-note"><ShieldCheck size={16} /><span>Created entirely in your browser.<br />Your originals stay untouched.</span></div></div></div>{review > 0 && <div className="notice amber"><AlertCircle size={17} /><span>{review} samples still need metadata review. You can export them, but verify suggestions before publishing.</span></div>}<label className="check-label rights"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} disabled={busy} /> I have the necessary rights to distribute the included audio.</label>{error && <p className="error-message">{error}</p>}<footer className="modal-footer"><span>{busy ? progress : `${samples.length} samples · No audio uploads`}</span><button className="button primary" disabled={!rights || busy || !samples.length} onClick={build}>{busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}{busy ? 'Building pack…' : 'Export sample pack'}</button></footer></>}
  </Modal>
}
