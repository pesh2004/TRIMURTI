// Frontend validators that mirror backend rules so the form can surface
// errors before a round-trip. Keep the spec in sync with
// backend/internal/modules/hr/validate.go.

export function validateThaiNationalID(raw: string | null | undefined): true | string {
  if (!raw) return true
  const cleaned = String(raw).replace(/[-\s]/g, '')
  if (cleaned.length !== 13) return 'national_id must be 13 digits'
  if (!/^\d{13}$/.test(cleaned)) return 'national_id must contain only digits'
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(cleaned[i]) * (13 - i)
  }
  const check = (11 - (sum % 11)) % 10
  if (check !== Number(cleaned[12])) return 'national_id checksum does not match'
  return true
}

export function validateBirthdateBeforeHire(
  birthdate: string | null | undefined,
  hiredAt: string | null | undefined,
): true | string {
  if (!birthdate || !hiredAt) return true
  if (!(birthdate < hiredAt)) return 'birthdate must be before hired_at'
  return true
}
