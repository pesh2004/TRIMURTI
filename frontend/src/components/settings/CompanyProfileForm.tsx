import { useEffect, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/hr/Toast'
import { settingsApi, type CompanyProfile, type UpdateCompanyRequest } from '@/lib/api/settings'
import { useAuth } from '@/lib/auth'
import { validateThaiNationalID } from '@/lib/hr/validate'

// FormState mirrors the editable slice of CompanyProfile. Everything is a
// string (even numeric fields) because plain-controlled-input pattern —
// the submit handler does the type conversion at the wire boundary.
type FormState = {
  name_th: string
  name_en: string
  tax_id: string
  phone: string
  email: string
  website: string
  address: string // joined with \n
  currency: string
  timezone: string
  fiscal_year_start_month: string
  vat_rate: string
  wht_rate: string
}

const CURRENCIES = ['THB', 'USD', 'SGD', 'VND', 'EUR', 'JPY', 'CNY', 'HKD']
const TIMEZONES = [
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Ho_Chi_Minh',
  'UTC',
]

function fromProfile(p: CompanyProfile): FormState {
  return {
    name_th: p.name_th,
    name_en: p.name_en,
    tax_id: p.tax_id ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    website: p.website ?? '',
    address: (p.address?.lines ?? []).join('\n'),
    currency: p.currency,
    timezone: p.timezone,
    fiscal_year_start_month: String(p.fiscal_year_start_month),
    vat_rate: p.vat_rate,
    wht_rate: p.wht_rate,
  }
}

// diff computes the sparse patch — only fields whose value actually
// changed go into the wire request. Reduces audit-log noise and avoids
// re-validating untouched fields server-side.
function diff(initial: FormState, current: FormState): UpdateCompanyRequest {
  const out: UpdateCompanyRequest = {}
  if (initial.name_th !== current.name_th) out.name_th = current.name_th
  if (initial.name_en !== current.name_en) out.name_en = current.name_en
  if (initial.tax_id !== current.tax_id) out.tax_id = current.tax_id
  if (initial.phone !== current.phone) out.phone = current.phone
  if (initial.email !== current.email) out.email = current.email
  if (initial.website !== current.website) out.website = current.website
  if (initial.address !== current.address) {
    const lines = current.address.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0)
    out.address = { lines }
  }
  if (initial.currency !== current.currency) out.currency = current.currency
  if (initial.timezone !== current.timezone) out.timezone = current.timezone
  if (initial.fiscal_year_start_month !== current.fiscal_year_start_month) {
    out.fiscal_year_start_month = Number(current.fiscal_year_start_month)
  }
  if (initial.vat_rate !== current.vat_rate) out.vat_rate = current.vat_rate
  if (initial.wht_rate !== current.wht_rate) out.wht_rate = current.wht_rate
  return out
}

export function CompanyProfileForm() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('settings.write')
  const qc = useQueryClient()
  const toast = useToast()

  const q = useQuery({ queryKey: ['settings.company'], queryFn: settingsApi.getCompany })
  const [form, setForm] = useState<FormState | null>(null)
  const [initial, setInitial] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  useEffect(() => {
    if (q.data && !form) {
      const f = fromProfile(q.data)
      setForm(f)
      setInitial(f)
    }
  }, [q.data, form])

  const mut = useMutation({
    mutationFn: (payload: UpdateCompanyRequest) => settingsApi.updateCompany(payload),
    onSuccess: (after) => {
      qc.setQueryData(['settings.company'], after)
      const f = fromProfile(after)
      setForm(f)
      setInitial(f)
      toast.push(t('settings.company.saved'))
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'unknown'
      toast.push(t('settings.company.errGeneric', { msg }))
    },
  })

  if (q.isLoading || !form) {
    return <p className="t-small t-muted">{t('app.loading')}</p>
  }
  if (q.isError) {
    return <p className="t-small t-muted">{t('app.error')}</p>
  }

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (f: FormState) => {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!f.name_th.trim()) next.name_th = t('settings.company.errNameRequired')
    if (!f.name_en.trim()) next.name_en = t('settings.company.errNameRequired')
    if (f.tax_id) {
      const r = validateThaiNationalID(f.tax_id)
      if (r !== true) next.tax_id = t('settings.company.errInvalidTaxId')
    }
    for (const rate of ['vat_rate', 'wht_rate'] as const) {
      const n = Number(f[rate])
      if (Number.isNaN(n) || n < 0 || n > 100) next[rate] = t('settings.company.errInvalidRate')
    }
    return next
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form || !initial) return
    const err = validate(form)
    setErrors(err)
    if (Object.keys(err).length > 0) return
    const patch = diff(initial, form)
    if (Object.keys(patch).length === 0) return // no-op
    mut.mutate(patch)
  }

  // maxLen mirrors the caps enforced server-side in
  // backend/internal/modules/settings/company.go so the UI rejects
  // over-length pastes before they ever round-trip.
  const maxLen: Partial<Record<keyof FormState, number>> = {
    name_th: 200, name_en: 200, tax_id: 30,
    phone: 30, email: 200, website: 300,
  }

  const field = (id: keyof FormState, label: string, type = 'text', hint?: string) => (
    <div style={{ display: 'grid', gap: 4 }}>
      <label htmlFor={id} className="t-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={form[id]}
        onChange={set(id)}
        disabled={!canWrite}
        className="inp"
        maxLength={maxLen[id]}
        aria-invalid={!!errors[id]}
      />
      {hint ? <span className="t-xs t-muted">{hint}</span> : null}
      {errors[id] ? <span className="t-xs" style={{ color: 'var(--danger)' }}>{errors[id]}</span> : null}
    </div>
  )

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16, maxWidth: 780 }}>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.company.section_identity')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <label className="t-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings.company.code')}
              </label>
              <input className="inp" value={q.data?.code ?? ''} disabled />
            </div>
            <div />
            {field('name_th', t('settings.company.nameTh'))}
            {field('name_en', t('settings.company.nameEn'))}
            {field('tax_id', t('settings.company.taxId'), 'text', t('settings.company.taxIdHint'))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.company.section_contact')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field('phone', t('settings.company.phone'))}
            {field('email', t('settings.company.email'), 'email')}
            {field('website', t('settings.company.website'), 'url')}
            <div />
            <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 4 }}>
              <label className="t-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings.company.address')}
              </label>
              <textarea
                className="inp"
                rows={3}
                value={form.address}
                onChange={set('address')}
                disabled={!canWrite}
              />
              <span className="t-xs t-muted">{t('settings.company.addressHint')}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.company.section_financial')}</CardTitle>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <label className="t-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings.company.currency')}
              </label>
              <select className="inp" value={form.currency} onChange={set('currency')} disabled={!canWrite}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <label className="t-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings.company.timezone')}
              </label>
              <select className="inp" value={form.timezone} onChange={set('timezone')} disabled={!canWrite}>
                {TIMEZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <label className="t-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings.company.fiscalYearStart')}
              </label>
              <select
                className="inp"
                value={form.fiscal_year_start_month}
                onChange={set('fiscal_year_start_month')}
                disabled={!canWrite}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {t(`settings.company.months.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            {field('vat_rate', t('settings.company.vatRate'))}
            {field('wht_rate', t('settings.company.whtRate'))}
          </div>
        </CardBody>
      </Card>

      {canWrite ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? t('app.loading') : t('settings.company.save')}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
