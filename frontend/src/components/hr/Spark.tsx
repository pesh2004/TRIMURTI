// Sparkline SVG — ported 1:1 from hr-helpers.jsx in the design handoff.
export function Spark({
  data,
  w = 80,
  h = 28,
  stroke = 'currentColor',
  area = true,
}: {
  data: number[]
  w?: number
  h?: number
  stroke?: string
  area?: boolean
}) {
  if (!data || data.length === 0) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * h] as const)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const areaD = `${d} L${w},${h} L0,${h} Z`
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {area && <path d={areaD} fill={stroke} opacity="0.12" />}
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
