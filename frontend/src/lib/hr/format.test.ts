import { describe, it, expect } from 'vitest'
import {
  fmtMoney,
  fmtDate,
  fmtDateLong,
  tenureYears,
  maskNid,
  fmtNid,
  avatarColor,
  initials,
} from './format'

describe('fmtMoney', () => {
  it('renders em-dash for null/undefined/empty', () => {
    expect(fmtMoney(null)).toBe('—')
    expect(fmtMoney(undefined)).toBe('—')
    expect(fmtMoney('')).toBe('—')
  })

  it('formats numbers with thousand separators', () => {
    expect(fmtMoney(45000)).toBe('45,000')
    expect(fmtMoney('120000.5')).toBe('120,000.5')
  })

  it('passes through non-finite as-is', () => {
    expect(fmtMoney('abc')).toBe('abc')
  })
})

describe('fmtDate', () => {
  it('returns ISO YYYY-MM-DD', () => {
    expect(fmtDate('2026-04-19T12:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('em-dashes for null/undefined', () => {
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate(undefined)).toBe('—')
  })

  it('returns the raw string when parsing fails', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date')
  })
})

describe('fmtDateLong', () => {
  it('renders Thai Buddhist year', () => {
    const out = fmtDateLong('2026-04-19', 'th')
    expect(out).toContain('2569') // 2026 + 543
    expect(out).toContain('เม.ย.')
  })

  it('renders English Gregorian year', () => {
    const out = fmtDateLong('2026-04-19', 'en')
    expect(out).toContain('2026')
    expect(out).toContain('Apr')
  })
})

describe('tenureYears', () => {
  it('returns 0 for missing hire date', () => {
    expect(tenureYears(null)).toBe(0)
    expect(tenureYears(undefined)).toBe(0)
  })

  it('uses terminated_at as the end when set', () => {
    // 2-year tenure to the day
    const y = tenureYears('2020-01-01', '2022-01-01')
    expect(y).toBeCloseTo(2, 1)
  })

  it('uses now() as the end when not terminated', () => {
    // A hire date 1 year ago → tenure ~= 1
    const hired = new Date(Date.now() - 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const y = tenureYears(hired)
    expect(y).toBeGreaterThan(0.95)
    expect(y).toBeLessThan(1.05)
  })
})

describe('maskNid', () => {
  it('renders em-dash when missing', () => {
    expect(maskNid(null)).toBe('—')
    expect(maskNid('')).toBe('—')
  })

  it('masks a 13-digit NID keeping only the last digit', () => {
    const out = maskNid('1234567890123')
    expect(out.startsWith('•')).toBe(true)
    expect(out.endsWith('-3')).toBe(true)
  })

  it('short/malformed NIDs become fully masked', () => {
    expect(maskNid('12')).toBe('•••••')
  })
})

describe('fmtNid', () => {
  it('formats 13 digits as N-NNNN-NNNNN-NN-N', () => {
    expect(fmtNid('1234567890123')).toBe('1-2345-67890-12-3')
  })

  it('passes through non-13-digit as-is', () => {
    expect(fmtNid('abc')).toBe('abc')
    expect(fmtNid('12345')).toBe('12345')
  })
})

describe('avatarColor', () => {
  it('is deterministic for the same seed', () => {
    expect(avatarColor('TMT-260001')).toBe(avatarColor('TMT-260001'))
  })

  it('returns one of the palette colors', () => {
    const out = avatarColor('X')
    expect(out).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('initials', () => {
  it('joins first letters uppercased', () => {
    expect(initials('John', 'Doe')).toBe('JD')
  })

  it("returns '?' when both names are empty", () => {
    expect(initials('', '')).toBe('?')
    expect(initials(null, undefined)).toBe('?')
  })
})
