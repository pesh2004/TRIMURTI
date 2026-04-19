import { describe, it, expect } from 'vitest'
import { validateThaiNationalID, validateBirthdateBeforeHire } from './validate'

describe('validateThaiNationalID', () => {
  it('accepts empty input (field is optional)', () => {
    expect(validateThaiNationalID('')).toBe(true)
    expect(validateThaiNationalID(null)).toBe(true)
    expect(validateThaiNationalID(undefined)).toBe(true)
  })

  it('accepts a valid 13-digit ID', () => {
    expect(validateThaiNationalID('1234567890121')).toBe(true)
  })

  it('accepts the dashed form', () => {
    expect(validateThaiNationalID('1-2345-67890-12-1')).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(validateThaiNationalID('123')).toMatch(/13 digits/)
    expect(validateThaiNationalID('12345678901234')).toMatch(/13 digits/)
  })

  it('rejects non-digits', () => {
    expect(validateThaiNationalID('abcdefghijklm')).toMatch(/only digits/)
  })

  it('rejects bad checksum', () => {
    expect(validateThaiNationalID('1234567890123')).toMatch(/checksum/)
  })
})

describe('validateBirthdateBeforeHire', () => {
  it('is a no-op when either date is missing', () => {
    expect(validateBirthdateBeforeHire('', '2022-01-01')).toBe(true)
    expect(validateBirthdateBeforeHire('1990-01-01', '')).toBe(true)
  })

  it('passes when birthdate < hired_at', () => {
    expect(validateBirthdateBeforeHire('1990-05-15', '2022-01-03')).toBe(true)
  })

  it('fails when birthdate >= hired_at', () => {
    expect(validateBirthdateBeforeHire('2022-01-03', '2022-01-03')).toMatch(/birthdate/)
    expect(validateBirthdateBeforeHire('2030-01-01', '2022-01-03')).toMatch(/birthdate/)
  })
})
