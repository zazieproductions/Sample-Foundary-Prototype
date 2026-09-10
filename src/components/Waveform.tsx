interface Props { values: number[]; progress?: number; mini?: boolean; color?: string; onSeek?: (fraction: number) => void }
export default function Waveform({ values, progress = 0, mini = false, color = 'currentColor', onSeek }: Props) {
  const count = mini ? 55 : 150
  const heights = Array.from({ length: count }, (_, i) => values[Math.floor(i * values.length / count)] || 0.015)
  return <svg className={`waveform ${onSeek ? 'seekable' : ''}`} viewBox={`0 0 ${count * 4} 48`} preserveAspectRatio="none" role={onSeek ? 'slider' : 'img'} aria-label={onSeek ? 'Seek audio' : 'Audio waveform'} tabIndex={onSeek ? 0 : undefined} aria-valuemin={onSeek ? 0 : undefined} aria-valuemax={onSeek ? 100 : undefined} aria-valuenow={onSeek ? Math.round(progress * 100) : undefined} onKeyDown={e => { if (onSeek && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); onSeek(Math.min(1, Math.max(0, progress + (e.key === 'ArrowRight' ? 0.05 : -0.05)))) } }} onClick={e => { if (onSeek) { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width) } }}>
    {heights.map((v, i) => <rect key={i} x={i * 4} y={24 - Math.max(1, v * 21)} width={mini ? 1.8 : 2} height={Math.max(2, v * 42)} rx="1" fill={i / count <= progress && progress > 0 ? '#244d35' : color} />)}
  </svg>
}
