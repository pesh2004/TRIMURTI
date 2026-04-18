// HR formatters — ported from claude.ai/design handoff so the UI renders
// Thai ID, currency, dates and tenure exactly the way the prototype did.

export function fmtMoney(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—'
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return String(n)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num)
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return String(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fmtDateLong(d: string | Date | null | undefined, lang: 'th' | 'en'): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return String(d)
  const months = {
    th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  }
  const year = lang === 'th' ? dt.getFullYear() + 543 : dt.getFullYear()
  return `${dt.getDate()} ${months[lang][dt.getMonth()]} ${year}`
}

// Tenure in years since hire (end=terminated_at or today).
export function tenureYears(hired: string | null | undefined, terminated?: string | null): number {
  if (!hired) return 0
  const end = terminated ? new Date(terminated) : new Date()
  const start = new Date(hired)
  return (end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000)
}

export function maskNid(nid: string | null | undefined): string {
  if (!nid) return '—'
  const s = String(nid).replace(/\D/g, '')
  if (s.length < 4) return '•••••'
  return '•-••••-•••••-••-' + s.slice(-1)
}

export function fmtNid(nid: string | null | undefined): string {
  const s = String(nid || '').replace(/\D/g, '')
  if (s.length !== 13) return String(nid || '—')
  return `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}`
}

// Deterministic avatar color from the employee_code so the same person always
// gets the same colour without server help.
const AVATAR_PALETTE = [
  '#0b4f6c', '#8b5a2b', '#5d6d7e', '#7d3c98', '#1e6091',
  '#ab4e19', '#515a5a', '#6c3483', '#1f618d', '#935116',
]
export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

export function initials(firstEn: string | null | undefined, lastEn: string | null | undefined): string {
  const a = (firstEn || '').charAt(0)
  const b = (lastEn || '').charAt(0)
  return (a + b).toUpperCase() || '?'
}
