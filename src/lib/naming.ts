import type { Category } from './types'

/** Turns any text into a clean underscore segment: "Rain field (take 2).wav" -> "Rain_field_take_2" */
export function nameSlug(value: string, maxLength = 48): string {
  const slug = value
    .replace(/\.[^/.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (slug.length > maxLength ? slug.slice(0, maxLength) : slug).replace(/_+$/, '')
}

/** Guarantees uniqueness inside a pack by appending _2, _3, … before the extension */
export function uniqueSampleName(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken)
  if (!used.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; i < 100; i++) {
    const candidate = `${stem}_${i}${ext}`
    if (!used.has(candidate)) return candidate
  }
  return `${stem}_${Date.now()}${ext}`
}

/** Names a sample from its analysis: BPM first, then the original file name, then the genre (category).
 *  Example: "field recording 3.wav" at 124 BPM → 124BPM_field_recording_3_Texture.wav
 *  Segments that are unknown (no tempo detected, Unclassified) are left out. */
export function autoSampleName(originalName: string, bpm: number | null | undefined, category: Category, taken: Iterable<string> = []): string {
  const base = nameSlug(originalName) || 'Sample'
  const genre = category && category !== 'Unclassified' ? nameSlug(category) : ''
  const tempo = bpm && bpm > 0 ? `${Math.round(bpm)}BPM` : ''
  return uniqueSampleName(`${[tempo, base, genre].filter(Boolean).join('_')}.wav`, taken)
}
