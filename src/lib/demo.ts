import { analyzeAudio, encodeWav } from './audio'
import type { Category, Sample, Workspace } from './types'
export async function createStarter(): Promise<Workspace> {
  const configs: { name: string; category: Category; duration: number; kind: string; tags: string[] }[] = [
    { name: 'Forest_rain_texture_01.wav', category: 'Texture', duration: 8.4, kind: 'rain', tags: ['organic', 'rain-like', 'soft'] },
    { name: 'Soft_wood_knock_01.wav', category: 'Percussion', duration: 1.8, kind: 'knock', tags: ['wooden', 'one-shot', 'warm'] },
    { name: 'Analog_drift_pad_01.wav', category: 'Tonal', duration: 8, kind: 'pad', tags: ['analog', 'evolving', 'warm'] },
    { name: 'Granular_dust_01.wav', category: 'Texture', duration: 5.2, kind: 'dust', tags: ['granular', 'crackle', 'lo-fi'] },
    { name: 'Air_wash_01.wav', category: 'Ambience', duration: 6.5, kind: 'air', tags: ['airy', 'rising', 'soft'] },
    { name: 'Low_tide_drone_01.wav', category: 'Tonal', duration: 7.6, kind: 'drone', tags: ['deep', 'atmospheric', 'dark'] },
    { name: 'Paper_rustle_01.wav', category: 'Texture', duration: 3.2, kind: 'paper', tags: ['paper-like', 'tactile', 'dry'] },
    { name: 'Glass_chime_01.wav', category: 'Tonal', duration: 4.8, kind: 'chime', tags: ['glassy', 'resonant', 'one-shot'] },
  ]
  const samples: Sample[] = []
  let seed = 24913
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1 }
  for (const [index, config] of configs.entries()) {
    const rate = 44100, data = new Float32Array(Math.round(rate * config.duration))
    let low = 0, low2 = 0, grain = 0
    for (let i = 0; i < data.length; i++) {
      const t = i / rate, noise = random(), fade = Math.min(1, t * 12, (config.duration - t) * 5)
      low += 0.045 * (noise - low); low2 += 0.002 * (noise - low2)
      let v = 0
      if (config.kind === 'rain') v = (low * 1.5 + noise * 0.07) * (0.6 + 0.2 * Math.sin(t * 1.7))
      if (config.kind === 'knock') v = (Math.sin(t * 2 * Math.PI * (180 + 100 * Math.exp(-t * 80))) * 0.7 + noise * 0.2) * Math.exp(-t * 13)
      if (config.kind === 'pad') v = (Math.sin(t * 2 * Math.PI * 130.81) + 0.5 * Math.sin(t * 2 * Math.PI * 196) + 0.3 * Math.sin(t * 2 * Math.PI * 261.9)) * 0.18 * Math.min(1, t / 1.4, (config.duration - t) / 2) * (0.8 + Math.sin(t * 1.2) * 0.1)
      if (config.kind === 'dust') { grain *= 0.97; if (random() > 0.998) grain = random() * 0.7; v = grain + low * 0.4 }
      if (config.kind === 'air') v = low * 2 * Math.sin(Math.PI * t / config.duration) * (0.7 + Math.sin(t * 0.6) * 0.2)
      if (config.kind === 'drone') v = (Math.sin(t * Math.PI * 2 * 65.41) + Math.sin(t * Math.PI * 2 * 65.72) * 0.4 + low2 * 3) * 0.26 * Math.min(1, t, (config.duration - t) / 2)
      if (config.kind === 'paper') v = (noise - low) * 0.23 * Math.pow(Math.abs(Math.sin(t * 6.3)), 8)
      if (config.kind === 'chime') v = (Math.sin(t * Math.PI * 2 * 783.99) * Math.exp(-t * 1.2) + Math.sin(t * Math.PI * 2 * 2107) * Math.exp(-t * 2) * 0.3) * 0.5
      data[i] = v * Math.max(0, fade)
    }
    const blob = encodeWav([data], rate), analysis = await analyzeAudio(blob)
    analysis.method = 'synthesized'
    samples.push({ id: `starter-${index}`, packId: 'organic-textures', name: config.name, originalName: config.name, blob, category: config.category, tags: config.tags, bpm: null, key: config.kind === 'pad' || config.kind === 'drone' ? 'C' : config.kind === 'chime' ? 'G' : null, status: index === 3 || index === 6 ? 'review' : 'ready', favorite: false, createdAt: Date.now() - index * 1000, analysis, trim: false, normalize: false, fade: false })
  }
  return { samples, packs: [{ id: 'organic-textures', name: 'Organic Textures', description: 'Tactile sounds. Natural imperfections. Endless possibilities.', author: 'Sample Foundry', createdAt: Date.now(), starter: true }], activePackId: 'organic-textures' }
}
