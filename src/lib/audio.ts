import type { AudioAnalysis, Category, Sample } from './types'

export function wavInfo(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const text = (p: number, n: number) => String.fromCharCode(...new Uint8Array(buffer, p, n))
  if (buffer.byteLength < 44 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') return null
  for (let p = 12; p + 8 < buffer.byteLength;) {
    const size = view.getUint32(p + 4, true)
    if (text(p, 4) === 'fmt ' && size >= 16 && p + 24 <= buffer.byteLength) return { rate: view.getUint32(p + 12, true), bits: view.getUint16(p + 22, true) }
    p += 8 + size + (size % 2)
  }
  return null
}
export async function decode(blob: Blob): Promise<AudioBuffer> {
  const bytes = await blob.arrayBuffer()
  const rate = wavInfo(bytes)?.rate || 44100
  const ctx = new OfflineAudioContext(1, 1, Math.min(96000, Math.max(8000, rate)))
  return ctx.decodeAudioData(bytes)
}
export function mono(buffer: AudioBuffer): Float32Array {
  const output = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) output[i] += data[i] / buffer.numberOfChannels
  }
  return output
}
export const db = (value: number) => Math.max(-96, 20 * Math.log10(Math.max(0.000016, value)))

function spectrum(data: Float32Array, rate: number) {
  const n = 2048, re = new Float64Array(n), im = new Float64Array(n)
  const start = Math.max(0, Math.floor(data.length * 0.3) - n / 2)
  for (let i = 0; i < n; i++) re[i] = (data[start + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)))
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const r = re[i]; re[i] = re[j]; re[j] = r }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < len / 2; j++) {
        const c = Math.cos(ang * j), s = Math.sin(ang * j)
        const a = i + j, b = a + len / 2
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
      }
    }
  }
  let total = 0, weighted = 0, log = 0
  for (let i = 1; i < n / 2; i++) {
    const power = Math.max(1e-12, re[i] * re[i] + im[i] * im[i])
    total += power; weighted += power * i * rate / n; log += Math.log(power)
  }
  return { centroid: weighted / Math.max(total, 1e-12), flatness: Math.exp(log / (n / 2 - 1)) / (total / (n / 2 - 1)) }
}
function estimatePitch(data: Float32Array, rate: number): number | null {
  const step = Math.max(1, Math.floor(rate / 8000)), sr = rate / step, size = 2048
  const values = new Float32Array(size)
  const start = Math.floor(Math.max(0, data.length * 0.3 - size * step / 2))
  let energy = 0
  for (let i = 0; i < size; i++) { values[i] = data[start + i * step] || 0; energy += values[i] ** 2 }
  if (energy / size < 0.0001) return null
  let best = 0, bestLag = 0
  for (let lag = Math.floor(sr / 1000); lag < Math.min(size / 2, sr / 45); lag++) {
    let sum = 0, e1 = 0, e2 = 0
    for (let i = 0; i < size - lag; i++) { sum += values[i] * values[i + lag]; e1 += values[i] ** 2; e2 += values[i + lag] ** 2 }
    const corr = sum / Math.sqrt(Math.max(1e-20, e1 * e2))
    if (corr > best) { best = corr; bestLag = lag }
  }
  return best > 0.88 && bestLag ? sr / bestLag : null
}
function estimateBpm(data: Float32Array, rate: number): number | null {
  if (data.length / rate < 4) return null
  const hop = Math.floor(rate / 100), count = Math.min(6000, Math.floor(data.length / hop))
  const onset = new Float32Array(count)
  let previous = 0, total = 0
  for (let i = 0; i < count; i++) {
    let e = 0
    for (let j = 0; j < hop; j += 4) e += (data[i * hop + j] || 0) ** 2
    const rms = Math.sqrt(e / (hop / 4)); onset[i] = Math.max(0, rms - previous); previous = rms; total += onset[i] ** 2
  }
  let best = 0, bestLag = 0
  for (let lag = 33; lag <= 100; lag++) {
    let corr = 0
    for (let i = lag; i < count; i++) corr += onset[i] * onset[i - lag]
    corr /= Math.max(total, 1e-12)
    if (corr > best) { best = corr; bestLag = lag }
  }
  return best > 0.5 ? Math.round(6000 / bestLag) : null
}
export async function analyzeAudio(blob: Blob): Promise<AudioAnalysis> {
  const buffer = await decode(blob), data = mono(buffer), rate = buffer.sampleRate
  let peak = 0, energy = 0, first = data.length, last = 0
  const waveform: number[] = []
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]); peak = Math.max(peak, a); energy += data[i] * data[i]
    if (a > 0.001) { first = Math.min(first, i); last = i }
  }
  for (let i = 0; i < 240; i++) {
    const from = Math.floor(i * data.length / 240), to = Math.floor((i + 1) * data.length / 240)
    let p = 0
    for (let j = from; j < to; j += Math.max(1, Math.floor((to - from) / 180))) p = Math.max(p, Math.abs(data[j]))
    waveform.push(p)
  }
  const maxWave = Math.max(...waveform, 0.01)
  const { centroid, flatness } = spectrum(data, rate)
  const rms = Math.sqrt(energy / Math.max(1, data.length)), crest = peak / Math.max(rms, 1e-9)
  const pitch = flatness < 0.08 ? estimatePitch(data, rate) : null
  const bpm = estimateBpm(data, rate)
  const category: Category = peak < 0.001 ? 'Unclassified' : pitch ? 'Tonal' : crest > 5 && buffer.duration < 5 ? 'Percussion' : buffer.duration > 12 && flatness > 0.1 ? 'Ambience' : 'Texture'
  const midi = pitch ? Math.round(69 + 12 * Math.log2(pitch / 440)) : null
  const key = midi === null ? null : ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][((midi % 12) + 12) % 12]
  const tags = [buffer.numberOfChannels > 1 ? 'stereo' : 'mono', buffer.duration < 2 ? 'one-shot' : 'sustained', centroid > 3000 ? 'bright' : centroid < 500 ? 'dark' : 'midrange']
  if (peak >= 0.999) tags.push('clipping-risk')
  if (peak < 0.001) tags.push('near-silent')
  return { duration: buffer.duration, sampleRate: rate, channels: buffer.numberOfChannels, bitDepth: wavInfo(await blob.arrayBuffer())?.bits || null, peakDb: db(peak), rmsDb: db(rms), silenceStart: first === data.length ? 0 : first / rate, silenceEnd: first === data.length ? 0 : (data.length - last - 1) / rate, centroid, flatness, waveform: waveform.map(v => v / maxWave), bpm, pitch, key, category, tags, method: 'signal' }
}
export function encodeWav(channels: Float32Array[], rate: number, bits = 16, info: Record<string, string> = {}): Blob {
  const encoder = new TextEncoder()
  const entries = Object.entries(info).map(([id, text]) => {
    const bytes = encoder.encode(text + '\0'), length = bytes.length + (bytes.length % 2)
    return { id, bytes, length }
  })
  const listLength = entries.length ? 4 + entries.reduce((n, e) => n + 8 + e.length, 0) : 0
  const count = channels[0].length, nChannels = channels.length, bytesPerSample = bits / 8
  const dataSize = count * nChannels * bytesPerSample
  const total = 44 + dataSize + (dataSize % 2) + (listLength ? 8 + listLength : 0)
  const buffer = new ArrayBuffer(total), view = new DataView(buffer)
  const text = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  text(0, 'RIFF'); view.setUint32(4, total - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true)
  view.setUint16(20, 1, true); view.setUint16(22, nChannels, true); view.setUint32(24, rate, true)
  view.setUint32(28, rate * nChannels * bytesPerSample, true); view.setUint16(32, nChannels * bytesPerSample, true); view.setUint16(34, bits, true)
  text(36, 'data'); view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < count; i++) for (const channel of channels) {
    const value = Math.max(-1, Math.min(1, channel[i]))
    if (bits === 24) {
      const v = Math.round(value * (value < 0 ? 8388608 : 8388607))
      view.setUint8(offset, v & 255); view.setUint8(offset + 1, (v >> 8) & 255); view.setUint8(offset + 2, (v >> 16) & 255)
    } else view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true)
    offset += bytesPerSample
  }
  offset += dataSize % 2
  if (listLength) {
    text(offset, 'LIST'); view.setUint32(offset + 4, listLength, true); text(offset + 8, 'INFO'); offset += 12
    for (const entry of entries) { text(offset, entry.id); view.setUint32(offset + 4, entry.bytes.length, true); new Uint8Array(buffer, offset + 8, entry.bytes.length).set(entry.bytes); offset += 8 + entry.length }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
export async function prepareAudio(sample: Sample, targetRate?: number) {
  let buffer = await decode(sample.blob)
  if (targetRate && targetRate !== buffer.sampleRate) {
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * targetRate), targetRate)
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination); source.start()
    buffer = await ctx.startRendering()
  }
  const rate = buffer.sampleRate
  const start = sample.trim ? Math.max(0, Math.floor((sample.analysis.silenceStart - 0.005) * rate)) : 0
  const end = sample.trim ? Math.min(buffer.length, Math.ceil((buffer.duration - sample.analysis.silenceEnd + 0.005) * rate)) : buffer.length
  const gain = sample.normalize && sample.analysis.peakDb > -90 ? Math.min(100, Math.pow(10, (-1 - sample.analysis.peakDb) / 20)) : 1
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => {
    const data = buffer.getChannelData(c).slice(start, Math.max(start + 1, end)), fadeLength = Math.min(Math.floor(rate * 0.005), Math.floor(data.length / 2))
    for (let i = 0; i < data.length; i++) {
      const envelope = sample.fade ? Math.min(1, i / fadeLength, (data.length - 1 - i) / fadeLength) : 1
      data[i] *= gain * (Number.isFinite(envelope) ? envelope : 1)
    }
    return data
  })
  return { channels, rate }
}
export async function modelInput(blob: Blob) {
  const buffer = await decode(blob), ctx = new OfflineAudioContext(1, Math.min(160000, Math.ceil(buffer.duration * 16000)), 16000)
  const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination); source.start()
  const result = await ctx.startRendering()
  return result.getChannelData(0)
}
export function categoryFromLabel(label: string): Category {
  if (/speech|voice|singing|vocal|whisper|conversation|choir|scream|laugh/i.test(label)) return 'Voice'
  if (/drum|percussion|knock|clap|snare|cymbal|tap|ratchet|thump/i.test(label)) return 'Percussion'
  if (/music|piano|guitar|synth|organ|violin|flute|bell|bass|tone|chime|instrument/i.test(label)) return 'Tonal'
  if (/rain|wind|water|bird|forest|insect|animal|stream|ocean|nature|traffic|crowd|environment/i.test(label)) return 'Ambience'
  if (/noise|rustle|crackle|static|scratch|crumpl/i.test(label)) return 'Texture'
  return 'Effects'
}
export const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
export const formatSize = (bytes: number) => bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`
export const safeName = (name: string) => name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'sample'
