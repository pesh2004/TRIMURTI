import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icons } from './icons'
import { Avatar } from './Avatar'
import {
  hrApi,
  type CreateEmployeeRequest,
  type Employee,
  type EmployeeStatus,
  type EmploymentType,
  type Gender,
  type UpdateEmployeeRequest,
} from '@/lib/api/hr'
import { useAuth } from '@/lib/auth'
import { useToast } from './Toast'

type FormState = {
  company_id: number
  department_id: number
  position_id: number
  first_name_th: string
  last_name_th: string
  first_name_en: string
  last_name_en: string
  nickname: string
  gender: Gender
  birthdate: string
  national_id: string
  phone: string
  email: string
  addr_line: string
  province: string
  postal: string
  employment_type: EmploymentType
  hired_at: string
  salary: string
  status: EmployeeStatus
}

function emptyForm(): FormState {
  return {
    company_id: 0,
    department_id: 0,
    position_id: 0,
    first_name_th: '',
    last_name_th: '',
    first_name_en: '',
    last_name_en: '',
    nickname: '',
    gender: 'M',
    birthdate: '',
    national_id: '',
    phone: '',
    email: '',
    addr_line: '',
    province: 'กรุงเทพมหานคร',
    postal: '',
    employment_type: 'fulltime',
    hired_at: new Date().toISOString().slice(0, 10),
    salary: '',
    status: 'active',
  }
}

function fromEmployee(emp: Employee): FormState {
  const addr = (emp.address as { line1?: string; province?: string; postal?: string } | null) || {}
  return {
    company_id: emp.company_id,
    department_id: emp.department_id,
    position_id: emp.position_id,
    first_name_th: emp.first_name_th,
    last_name_th: emp.last_name_th,
    first_name_en: emp.first_name_en ?? '',
    last_name_en: emp.last_name_en ?? '',
    nickname: emp.nickname ?? '',
    gender: emp.gender,
    birthdate: emp.birthdate.slice(0, 10),
    national_id: emp.national_id ?? '',
    phone: emp.phone ?? '',
    email: emp.email ?? '',
    addr_line: addr.line1 ?? '',
    province: addr.province ?? 'กรุงเทพมหานคร',
    postal: addr.postal ?? '',
    employment_type: emp.employment_type,
    hired_at: emp.hired_at.slice(0, 10),
    salary: emp.salary ?? '',
    status: emp.status,
  }
}

const PROVINCES = [
  'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'เชียงใหม่',
  'ขอนแก่น', 'นครราชสีมา', 'ภูเก็ต', 'ชลบุรี', 'ระยอง', 'สงขลา', 'อุดรธานี',
]

export function EmployeeForm({
  lang,
  editingId,
  onCancel,
  onSaved,
}: {
  lang: 'th' | 'en'
  editingId: number | null
  onCancel: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const isEditing = editingId != null
  const canReveal = hasPermission('hr_employees.reveal_pii')

  const revealSalaryWithAudit = (next: boolean, code: string) => {
    if (next) toast.push(lang === 'th' ? `audit: เปิดดูเงินเดือนของ ${code || 'พนักงานใหม่'}` : `Audit: salary of ${code || 'new employee'} revealed`)
  }

  const companiesQ = useQuery({ queryKey: ['hr', 'companies'], queryFn: () => hrApi.listCompanies(), staleTime: 60_000 })
  const positionsQ = useQuery({ queryKey: ['hr', 'positions'], queryFn: () => hrApi.listPositions(), staleTime: 60_000 })
  const editQ = useQuery({
    queryKey: ['hr', 'employee', editingId],
    queryFn: () => hrApi.getEmployee(editingId!),
    enabled: isEditing,
  })

  const [form, setForm] = useState<FormState>(emptyForm)
  const [open, setOpen] = useState({ personal: true, contact: true, employment: true, compensation: true })
  const [showSalary, setShowSalary] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Seed form with first company + first dept + first position when creating.
  useEffect(() => {
    if (isEditing) return
    if (form.company_id) return
    const firstCo = companiesQ.data?.items[0]
    const firstPos = positionsQ.data?.items[0]
    if (firstCo && firstPos) {
      setForm((f) => ({
        ...f,
        company_id: firstCo.id,
        position_id: firstPos.id,
      }))
    }
  }, [companiesQ.data, positionsQ.data, isEditing, form.company_id])

  // Load editing employee into the form.
  useEffect(() => {
    if (editQ.data) setForm(fromEmployee(editQ.data))
  }, [editQ.data])

  // Depts depend on company.
  const departmentsQ = useQuery({
    queryKey: ['hr', 'departments', form.company_id],
    queryFn: () => hrApi.listDepartments(form.company_id || undefined),
    enabled: form.company_id > 0,
  })

  // Auto-pick first dept when the company changes and existing dept doesn't belong.
  useEffect(() => {
    const depts = departmentsQ.data?.items
    if (!depts?.length) return
    if (!depts.find((d) => d.id === form.department_id)) {
      setForm((f) => ({ ...f, department_id: depts[0].id }))
    }
  }, [departmentsQ.data, form.department_id])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const validate = (): typeof errors => {
    const err: typeof errors = {}
    if (!form.first_name_th) err.first_name_th = t('hr.required')
    if (!form.last_name_th) err.last_name_th = t('hr.required')
    if (!form.birthdate) err.birthdate = t('hr.required')
    if (!form.hired_at) err.hired_at = t('hr.required')
    if (form.national_id) {
      const s = form.national_id.replace(/\D/g, '')
      if (s.length !== 13) err.national_id = t('hr.invalidNid')
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) err.email = t('hr.invalidEmail')
    if (form.phone && !/^[0-9\-+\s()]{8,}$/.test(form.phone)) err.phone = t('hr.invalidPhone')
    return err
  }

  const createMut = useMutation({
    mutationFn: (body: CreateEmployeeRequest) => hrApi.createEmployee(body),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateEmployeeRequest }) =>
      hrApi.updateEmployee(id, body),
  })

  const saving = createMut.isPending || updateMut.isPending

  const handleSave = async (closeAfter: boolean) => {
    const err = validate()
    setErrors(err)
    setTouched(
      Object.fromEntries(Object.keys(form).map((k) => [k, true])) as Partial<Record<keyof FormState, boolean>>,
    )
    if (Object.keys(err).length > 0) {
      // Re-open any section containing an error.
      const sections: Record<string, (keyof FormState)[]> = {
        personal: ['first_name_th', 'last_name_th', 'first_name_en', 'last_name_en', 'birthdate', 'national_id', 'gender'],
        contact: ['phone', 'email', 'addr_line', 'province', 'postal'],
        employment: ['company_id', 'department_id', 'position_id', 'employment_type', 'hired_at'],
        compensation: ['salary'],
      }
      setOpen((o) => {
        const next = { ...o }
        for (const [k, fields] of Object.entries(sections)) {
          if (fields.some((f) => err[f])) (next as Record<string, boolean>)[k] = true
        }
        return next
      })
      return
    }
    setSubmitError(null)

    const address =
      form.addr_line || form.province || form.postal
        ? { line1: form.addr_line, province: form.province, postal: form.postal }
        : undefined

    try {
      if (isEditing && editingId != null) {
        const body: UpdateEmployeeRequest = {
          department_id: form.department_id,
          position_id: form.position_id,
          first_name_th: form.first_name_th,
          last_name_th: form.last_name_th,
          first_name_en: form.first_name_en || undefined,
          last_name_en: form.last_name_en || undefined,
          nickname: form.nickname || undefined,
          national_id: form.national_id || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address,
          employment_type: form.employment_type,
          salary: form.salary || undefined,
          status: form.status === 'terminated' ? undefined : (form.status as Exclude<EmployeeStatus, 'terminated'>),
        }
        await updateMut.mutateAsync({ id: editingId, body })
      } else {
        const body: CreateEmployeeRequest = {
          company_id: form.company_id,
          department_id: form.department_id,
          position_id: form.position_id,
          first_name_th: form.first_name_th,
          last_name_th: form.last_name_th,
          first_name_en: form.first_name_en || undefined,
          last_name_en: form.last_name_en || undefined,
          nickname: form.nickname || undefined,
          gender: form.gender,
          birthdate: form.birthdate,
          national_id: form.national_id || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address,
          employment_type: form.employment_type,
          hired_at: form.hired_at,
          salary: form.salary || undefined,
        }
        await createMut.mutateAsync(body)
      }
      void qc.invalidateQueries({ queryKey: ['hr', 'employees'] })
      if (closeAfter) onSaved()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const errOf = <K extends keyof FormState>(k: K) => (touched[k] ? errors[k] : undefined)

  const selectedCo = companiesQ.data?.items.find((c) => c.id === form.company_id)
  const selectedDept = departmentsQ.data?.items.find((d) => d.id === form.department_id)
  const selectedPos = positionsQ.data?.items.find((p) => p.id === form.position_id)

  return (
    <div className="hr-page">
      <div className="page-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn ghost" onClick={onCancel}>
            {Icons.back(14)}
            <span style={{ marginLeft: 6 }}>{t('hr.back')}</span>
          </button>
          <div>
            <div className="t-label" style={{ marginBottom: 2 }}>
              {t('hr.title')} › {t('hr.list')}
            </div>
            <h1 className="page-title">
              {isEditing ? t('hr.edit') : t('hr.new')}
              {isEditing && editQ.data && (
                <span className="t-mono t-xs" style={{ marginLeft: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {editQ.data.employee_code}
                </span>
              )}
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onCancel}>
            {t('hr.cancel')}
          </button>
          <button className="btn" onClick={() => void handleSave(false)} disabled={saving}>
            {t('hr.saveDraft')}
          </button>
          <button className="btn primary" onClick={() => void handleSave(true)} disabled={saving}>
            {Icons.check(14)}
            <span style={{ marginLeft: 6 }}>{saving ? t('app.loading') : t('hr.saveClose')}</span>
          </button>
        </div>
      </div>

      {submitError && (
        <div
          role="alert"
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            background: 'var(--bad-bg)',
            border: '1px solid var(--bad)',
            color: 'var(--bad)',
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {submitError}
        </div>
      )}

      <div className="form-wrap">
        <div className="form-col">
          <Section
            title={t('hr.personal')}
            subtitle={t('hr.personalSub')}
            icon={Icons.user(15)}
            open={open.personal}
            onToggle={() => setOpen((o) => ({ ...o, personal: !o.personal }))}
          >
            <div className="grid-form">
              <Field label={t('hr.firstTh')} required error={errOf('first_name_th')}>
                <input
                  className={`input ${errOf('first_name_th') ? 'err' : ''}`}
                  value={form.first_name_th}
                  onBlur={() => setTouched((t) => ({ ...t, first_name_th: true }))}
                  onChange={(e) => set('first_name_th', e.target.value)}
                />
              </Field>
              <Field label={t('hr.lastTh')} required error={errOf('last_name_th')}>
                <input
                  className={`input ${errOf('last_name_th') ? 'err' : ''}`}
                  value={form.last_name_th}
                  onBlur={() => setTouched((t) => ({ ...t, last_name_th: true }))}
                  onChange={(e) => set('last_name_th', e.target.value)}
                />
              </Field>
              <Field label={t('hr.firstEn')}>
                <input className="input" value={form.first_name_en} onChange={(e) => set('first_name_en', e.target.value)} />
              </Field>
              <Field label={t('hr.lastEn')}>
                <input className="input" value={form.last_name_en} onChange={(e) => set('last_name_en', e.target.value)} />
              </Field>
              <Field label={t('hr.nick')}>
                <input className="input" value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />
              </Field>
              <Field label={t('hr.gender')} required>
                <div className="radio-row">
                  {([
                    { id: 'M', label: t('hr.male') },
                    { id: 'F', label: t('hr.female') },
                    { id: 'O', label: t('hr.other') },
                  ] as const).map((g) => (
                    <label key={g.id} className={`radio-card ${form.gender === g.id ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="gender"
                        checked={form.gender === g.id}
                        onChange={() => set('gender', g.id)}
                      />
                      <span>{g.label}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label={t('hr.birth')} required error={errOf('birthdate')}>
                <input
                  type="date"
                  className={`input ${errOf('birthdate') ? 'err' : ''}`}
                  value={form.birthdate}
                  onBlur={() => setTouched((t) => ({ ...t, birthdate: true }))}
                  onChange={(e) => set('birthdate', e.target.value)}
                />
              </Field>
              <Field label={t('hr.nid')} error={errOf('national_id')} col={2}
                     hint={!canReveal ? (lang === 'th' ? 'ต้องมีสิทธิ์ HR' : 'HR role required') : undefined}>
                <input
                  className={`input ${errOf('national_id') ? 'err' : ''}`}
                  type="text"
                  inputMode="numeric"
                  value={form.national_id}
                  maxLength={13}
                  placeholder="1234567890123"
                  onBlur={() => setTouched((t) => ({ ...t, national_id: true }))}
                  onChange={(e) => set('national_id', e.target.value.replace(/\D/g, ''))}
                  disabled={!canReveal}
                />
              </Field>
            </div>
          </Section>

          <Section
            title={t('hr.contact')}
            subtitle={t('hr.contactSub')}
            icon={Icons.phone(15)}
            open={open.contact}
            onToggle={() => setOpen((o) => ({ ...o, contact: !o.contact }))}
          >
            <div className="grid-form">
              <Field label={t('hr.phone')} error={errOf('phone')}>
                <input
                  className={`input ${errOf('phone') ? 'err' : ''}`}
                  value={form.phone}
                  placeholder="08x-xxx-xxxx"
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Field>
              <Field label={t('hr.email')} error={errOf('email')}>
                <input
                  className={`input ${errOf('email') ? 'err' : ''}`}
                  value={form.email}
                  placeholder="name@company.co.th"
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label={t('hr.address')} col={2}>
                <textarea
                  className="input"
                  rows={3}
                  value={form.addr_line}
                  onChange={(e) => set('addr_line', e.target.value)}
                  placeholder={lang === 'th' ? 'บ้านเลขที่ ถนน ตำบล อำเภอ' : 'House no., road, sub-district, district'}
                />
              </Field>
              <Field label={lang === 'th' ? 'จังหวัด' : 'Province'}>
                <select className="select" value={form.province} onChange={(e) => set('province', e.target.value)}>
                  {PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={lang === 'th' ? 'รหัสไปรษณีย์' : 'Postal code'}>
                <input
                  className="input"
                  value={form.postal}
                  maxLength={5}
                  placeholder="10xxx"
                  onChange={(e) => set('postal', e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>
          </Section>

          <Section
            title={t('hr.employment')}
            subtitle={t('hr.employmentSub')}
            icon={Icons.briefcase(15)}
            open={open.employment}
            onToggle={() => setOpen((o) => ({ ...o, employment: !o.employment }))}
          >
            <div className="grid-form">
              <Field label={t('hr.company')} required>
                <select
                  className="select"
                  value={form.company_id || ''}
                  onChange={(e) => set('company_id', Number(e.target.value))}
                  disabled={isEditing}
                >
                  {companiesQ.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {lang === 'th' ? c.name_th : c.name_en}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('hr.department')} required>
                <select
                  className="select"
                  value={form.department_id || ''}
                  onChange={(e) => set('department_id', Number(e.target.value))}
                >
                  {departmentsQ.data?.items.map((d) => (
                    <option key={d.id} value={d.id}>
                      {lang === 'th' ? d.name_th : d.name_en}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('hr.position')} required>
                <select
                  className="select"
                  value={form.position_id || ''}
                  onChange={(e) => set('position_id', Number(e.target.value))}
                >
                  {positionsQ.data?.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {lang === 'th' ? p.name_th : p.name_en}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('hr.etype')} required>
                <div className="seg">
                  {(['fulltime', 'contract', 'daily', 'parttime'] as const).map((x) => (
                    <button
                      key={x}
                      type="button"
                      className={`seg-btn ${form.employment_type === x ? 'active' : ''}`}
                      onClick={() => set('employment_type', x)}
                    >
                      {t(`hr.etype_${x}`)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t('hr.hiredAt')} required error={errOf('hired_at')}>
                <input
                  type="date"
                  className={`input ${errOf('hired_at') ? 'err' : ''}`}
                  value={form.hired_at}
                  onBlur={() => setTouched((t) => ({ ...t, hired_at: true }))}
                  onChange={(e) => set('hired_at', e.target.value)}
                />
              </Field>
              {isEditing && (
                <Field label={t('hr.status')}>
                  <select
                    className="select"
                    value={form.status}
                    onChange={(e) => set('status', e.target.value as EmployeeStatus)}
                  >
                    {(['active', 'on_leave', 'inactive'] as const).map((s) => (
                      <option key={s} value={s}>
                        {t(`hr.status_${s}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </Section>

          <Section
            title={t('hr.compensation')}
            subtitle={t('hr.compensationSub')}
            icon={Icons.wallet(15)}
            open={open.compensation}
            onToggle={() => setOpen((o) => ({ ...o, compensation: !o.compensation }))}
          >
            <div className="grid-form">
              <Field
                label={t('hr.salary')}
                col={2}
                hint={!canReveal ? (lang === 'th' ? 'ต้องมีสิทธิ์ HR' : 'HR role required') : undefined}
              >
                <div className="input-money input-sens">
                  <span className="prefix">฿</span>
                  <input
                    className="input"
                    style={{ textAlign: 'right' }}
                    type={showSalary && canReveal ? 'text' : 'password'}
                    inputMode="decimal"
                    value={canReveal && showSalary ? form.salary : '•••••••'}
                    disabled={!canReveal || !showSalary}
                    onChange={(e) => set('salary', e.target.value)}
                  />
                  <span className="suffix t-xs">THB/{form.employment_type === 'daily' ? 'day' : 'month'}</span>
                  <button
                    type="button"
                    className="sens-btn"
                    onClick={() => {
                      setShowSalary((v) => {
                        revealSalaryWithAudit(!v, editQ.data?.employee_code ?? '')
                        return !v
                      })
                    }}
                    disabled={!canReveal}
                  >
                    {showSalary ? Icons.eyeOff(13) : Icons.eye(13)}
                    <span>{showSalary ? t('hr.hide') : t('hr.reveal')}</span>
                  </button>
                </div>
                <div className="t-xs t-muted" style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {Icons.info(11)}
                  <span>
                    {lang === 'th'
                      ? 'การแสดงข้อมูลเงินเดือนจะถูกบันทึกใน audit log อัตโนมัติ'
                      : 'Revealing salary is automatically logged to audit'}
                  </span>
                </div>
              </Field>
            </div>
          </Section>
        </div>

        <aside className="form-aside">
          <div className="summary-card">
            <div className="summary-hd">{lang === 'th' ? 'ตัวอย่าง' : 'Preview'}</div>
            <div className="summary-avatar">
              <Avatar
                firstEn={form.first_name_en || '?'}
                lastEn={form.last_name_en || '?'}
                seed={editQ.data?.employee_code || 'new'}
                size={64}
              />
            </div>
            <div className="summary-name">
              {form.first_name_th || form.last_name_th
                ? `${form.first_name_th} ${form.last_name_th}`
                : lang === 'th'
                  ? '(ยังไม่ระบุชื่อ)'
                  : '(no name)'}
            </div>
            <div className="summary-sub t-xs t-muted">
              {form.first_name_en || form.last_name_en ? `${form.first_name_en} ${form.last_name_en}` : '—'}
              {form.nickname && <span> · {form.nickname}</span>}
            </div>
            <div className="divider" />
            <dl className="summary-dl">
              <dt>{t('hr.code')}</dt>
              <dd className="t-mono t-xs">
                {editQ.data?.employee_code ?? (lang === 'th' ? 'สร้างอัตโนมัติ' : 'auto-generated')}
              </dd>
              <dt>{t('hr.company')}</dt>
              <dd>{selectedCo?.code ?? '—'}</dd>
              <dt>{t('hr.department')}</dt>
              <dd>{selectedDept ? (lang === 'th' ? selectedDept.name_th : selectedDept.name_en) : '—'}</dd>
              <dt>{t('hr.position')}</dt>
              <dd>{selectedPos ? (lang === 'th' ? selectedPos.name_th : selectedPos.name_en) : '—'}</dd>
              <dt>{t('hr.etype')}</dt>
              <dd>{t(`hr.etype_${form.employment_type}`)}</dd>
              <dt>{t('hr.hiredAt')}</dt>
              <dd className="t-mono t-xs">{form.hired_at || '—'}</dd>
              <dt>{t('hr.status')}</dt>
              <dd>{t(`hr.status_${form.status}`)}</dd>
            </dl>
            <div className="divider" />
            <div className="t-xs t-muted">
              {Object.keys(errors).length > 0 ? (
                <span style={{ color: 'var(--bad)' }}>
                  {Icons.alert(11)} {lang === 'th' ? `มีข้อผิดพลาด ${Object.keys(errors).length} ช่อง` : `${Object.keys(errors).length} error${Object.keys(errors).length > 1 ? 's' : ''}`}
                </span>
              ) : (
                <span style={{ color: 'var(--ok)' }}>
                  {Icons.check(11)} {lang === 'th' ? 'พร้อมบันทึก' : 'Ready to save'}
                </span>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Section({
  title,
  subtitle,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className={`form-sec ${open ? 'open' : ''}`}>
      <button type="button" className="form-sec-hd" onClick={onToggle}>
        <span className="form-sec-ic">{icon}</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div className="form-sec-title">{title}</div>
          <div className="form-sec-sub t-xs t-muted">{subtitle}</div>
        </div>
        <span className={`form-sec-chev ${open ? 'up' : ''}`}>{Icons.down(14)}</span>
      </button>
      {open && <div className="form-sec-body">{children}</div>}
    </div>
  )
}

function Field({
  label,
  required,
  error,
  hint,
  children,
  col = 1,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
  col?: 1 | 2
}) {
  return (
    <div className={`field col-${col}`}>
      <label className="field-lbl">
        {label}
        {required && <span style={{ color: 'var(--bad)', marginLeft: 3 }}>*</span>}
        {hint && (
          <span className="t-xs t-dim" style={{ marginLeft: 6, fontWeight: 400 }}>
            {hint}
          </span>
        )}
      </label>
      {children}
      {error && (
        <div className="field-err">
          {Icons.alert(11)}
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

