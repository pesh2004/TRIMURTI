import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icons } from './icons'
import { Avatar } from './Avatar'
import { StatusPill } from './pills'
import { hrApi, type Employee, type EmployeeStatus } from '@/lib/api/hr'
import { fmtDate, fmtDateLong, fmtMoney, fmtNid, maskNid, tenureYears } from '@/lib/hr/format'
import { useAuth } from '@/lib/auth'
import { useToast } from './Toast'

type Tab = 'overview' | 'history' | 'documents' | 'notes'

export function EmployeeDrawer({
  lang,
  employeeId,
  onClose,
  onEdit,
}: {
  lang: 'th' | 'en'
  employeeId: number
  onClose: () => void
  onEdit: (id: number) => void
}) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const canReveal = hasPermission('hr_employees.reveal_pii')
  const canTerminate = hasPermission('hr_employees.terminate')

  const [tab, setTab] = useState<Tab>('overview')
  const [showNid, setShowNid] = useState(false)
  const [showSalary, setShowSalary] = useState(false)
  const [terminating, setTerminating] = useState(false)

  const revealNid = () => {
    const next = !showNid
    setShowNid(next)
    if (next) toast.push(lang === 'th' ? `audit: เปิดดูเลขบัตรของ ${empQ.data?.employee_code ?? ''}` : `Audit: NID of ${empQ.data?.employee_code ?? ''} revealed`)
  }
  const revealSalary = () => {
    const next = !showSalary
    setShowSalary(next)
    if (next) toast.push(lang === 'th' ? `audit: เปิดดูเงินเดือนของ ${empQ.data?.employee_code ?? ''}` : `Audit: salary of ${empQ.data?.employee_code ?? ''} revealed`)
  }

  const empQ = useQuery({
    queryKey: ['hr', 'employee', employeeId],
    queryFn: () => hrApi.getEmployee(employeeId),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'e' || e.key === 'E') onEdit(employeeId)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [employeeId, onClose, onEdit])

  const termMut = useMutation({
    mutationFn: ({ id, terminated_at, terminated_reason }: { id: number; terminated_at: string; terminated_reason: string }) =>
      hrApi.terminateEmployee(id, { terminated_at, terminated_reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hr', 'employees'] })
      void qc.invalidateQueries({ queryKey: ['hr', 'employee', employeeId] })
      setTerminating(false)
    },
  })

  const emp = empQ.data
  const loading = empQ.isLoading

  return (
    <>
      <div className="dr-scrim" onClick={onClose} />
      <aside className="dr-panel" role="dialog" aria-modal="true">
        {loading || !emp ? (
          <div className="dr-body">
            <div className="empty-sm t-muted">{t('app.loading')}</div>
          </div>
        ) : (
          <>
            <div className="dr-hd">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                <Avatar firstEn={emp.first_name_en} lastEn={emp.last_name_en} seed={emp.employee_code} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }} className="truncate">
                      {lang === 'th'
                        ? `${emp.first_name_th} ${emp.last_name_th}`
                        : `${emp.first_name_en ?? ''} ${emp.last_name_en ?? ''}`}
                    </div>
                    <StatusPill status={emp.status} />
                  </div>
                  <div className="t-small t-muted" style={{ marginTop: 2 }}>
                    {lang === 'th'
                      ? `${emp.first_name_en ?? ''} ${emp.last_name_en ?? ''}`
                      : `${emp.first_name_th} ${emp.last_name_th}`}
                    {emp.nickname && <span> · {emp.nickname}</span>}
                  </div>
                  <div className="t-xs t-dim" style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span className="t-mono">{emp.employee_code}</span>
                    <span>·</span>
                    <span>
                      {lang === 'th' ? emp.position_name_th : emp.position_name_en},{' '}
                      {lang === 'th' ? emp.department_name_th : emp.department_name_en}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn sm" onClick={() => onEdit(employeeId)} title="E">
                  {Icons.edit(12)}
                  <span style={{ marginLeft: 4 }}>{t('hr.edit')}</span>
                </button>
                {canTerminate && emp.status !== 'terminated' && (
                  <button
                    className="btn sm danger"
                    onClick={() => setTerminating(true)}
                    disabled={termMut.isPending}
                  >
                    {Icons.userX(12)}
                    <span style={{ marginLeft: 4 }}>{t('hr.terminate')}</span>
                  </button>
                )}
                <button className="icon-btn" onClick={onClose}>
                  {Icons.x(14)}
                </button>
              </div>
            </div>

            <div className="dr-tabs">
              {(
                [
                  { id: 'overview' as const, label: t('hr.overview') },
                  { id: 'history' as const, label: t('hr.empHistory') },
                  { id: 'documents' as const, label: t('hr.documents') },
                  { id: 'notes' as const, label: t('hr.notes') },
                ]
              ).map((x) => (
                <button key={x.id} className={`dr-tab ${tab === x.id ? 'active' : ''}`} onClick={() => setTab(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>

            <div className="dr-body">
              {tab === 'overview' && (
                <OverviewTab
                  emp={emp}
                  lang={lang}
                  showNid={showNid}
                  showSalary={showSalary}
                  canReveal={canReveal}
                  onToggleNid={revealNid}
                  onToggleSalary={revealSalary}
                />
              )}
              {tab === 'history' && <HistoryTab emp={emp} lang={lang} />}
              {tab === 'documents' && (
                <div className="empty-sm">
                  <div style={{ color: 'var(--text-dim)' }}>{Icons.file(24)}</div>
                  <div className="t-small t-muted" style={{ marginTop: 6 }}>
                    {lang === 'th' ? 'เอกสาร — จะเพิ่มใน Phase 1B' : 'Documents — Phase 1B'}
                  </div>
                </div>
              )}
              {tab === 'notes' && (
                <div className="empty-sm">
                  <div style={{ color: 'var(--text-dim)' }}>{Icons.info(24)}</div>
                  <div className="t-small t-muted" style={{ marginTop: 6 }}>
                    {lang === 'th' ? 'บันทึก — จะเพิ่มใน Phase 1B' : 'Notes — Phase 1B'}
                  </div>
                </div>
              )}
            </div>

            <div className="dr-ft t-xs t-muted">
              {t('hr.createdAt')} <b>{fmtDateLong(emp.created_at, lang)}</b>
              <span className="sep">·</span>
              {t('hr.updatedAt')} <b>{fmtDateLong(emp.updated_at, lang)}</b>
            </div>
          </>
        )}
      </aside>

      {terminating && emp && (
        <TerminateDialog
          lang={lang}
          onCancel={() => setTerminating(false)}
          onConfirm={(date, reason) =>
            termMut.mutate({ id: emp.id, terminated_at: date, terminated_reason: reason })
          }
          busy={termMut.isPending}
          error={termMut.error instanceof Error ? termMut.error.message : null}
        />
      )}
    </>
  )
}

function TerminateDialog({
  lang,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  lang: 'th' | 'en'
  onCancel: () => void
  onConfirm: (date: string, reason: string) => void
  busy: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  return (
    <>
      <div className="dr-scrim" style={{ zIndex: 110 }} onClick={onCancel} />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          width: 420,
          maxWidth: '95vw',
          zIndex: 111,
          boxShadow: 'var(--shadow-lg)',
          padding: 20,
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('hr.terminate')}</h3>
        <p className="t-xs t-muted" style={{ margin: 0 }}>
          {lang === 'th' ? 'กำหนดวันที่พ้นสภาพและเหตุผล' : 'Set termination date and reason'}
        </p>
        <div style={{ marginTop: 14 }}>
          <div className="field-lbl">{t('hr.terminatedAt')}</div>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="field-lbl">{t('hr.terminatedReason')}</div>
          <textarea
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={lang === 'th' ? 'เช่น ลาออก โดนเลิกจ้าง ฯลฯ' : 'e.g. resignation, layoff, ...'}
          />
        </div>
        {error && (
          <div style={{ marginTop: 10, color: 'var(--bad)', fontSize: 12 }}>
            {Icons.alert(11)} {error}
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel} disabled={busy}>
            {t('hr.cancel')}
          </button>
          <button
            className="btn danger"
            onClick={() => onConfirm(date, reason)}
            disabled={busy || !reason.trim()}
          >
            {busy ? t('app.loading') : t('hr.terminate')}
          </button>
        </div>
      </div>
    </>
  )
}

function OverviewTab({
  emp,
  lang,
  showNid,
  showSalary,
  canReveal,
  onToggleNid,
  onToggleSalary,
}: {
  emp: Employee
  lang: 'th' | 'en'
  showNid: boolean
  showSalary: boolean
  canReveal: boolean
  onToggleNid: () => void
  onToggleSalary: () => void
}) {
  const { t } = useTranslation()
  const tenure = tenureYears(emp.hired_at, emp.terminated_at)
  const tenureStr = tenure < 1 ? t('hr.tenureLess1') : `${tenure.toFixed(1)} ${t('hr.years')}`
  const addr = (emp.address as { line1?: string; province?: string; postal?: string } | null) || {}
  const nidRaw = emp.national_id || ''
  const salaryRaw = emp.salary || ''
  const salaryMaskedByServer = salaryRaw === '•••••'
  const nidMaskedByServer = nidRaw.startsWith('•')

  const nidDisplay = () => {
    if (!nidRaw) return '—'
    if (nidMaskedByServer) return nidRaw
    return showNid ? fmtNid(nidRaw) : maskNid(nidRaw)
  }
  const salaryDisplay = () => {
    if (!salaryRaw) return '—'
    if (salaryMaskedByServer) return '฿ •••••••'
    return showSalary
      ? `฿ ${fmtMoney(salaryRaw)} THB${emp.employment_type === 'daily' ? '/day' : '/mo'}`
      : '฿ •••••••'
  }

  return (
    <div className="dr-ov">
      <OvGroup icon={Icons.user(13)} title={t('hr.personal')}>
        <KV label={lang === 'th' ? 'ชื่อไทย' : 'Name (TH)'}>
          {emp.first_name_th} {emp.last_name_th}
        </KV>
        <KV label={lang === 'th' ? 'ชื่ออังกฤษ' : 'Name (EN)'}>
          {emp.first_name_en ?? '—'} {emp.last_name_en ?? ''}
        </KV>
        <KV label={t('hr.nick')}>{emp.nickname || '—'}</KV>
        <KV label={t('hr.gender')}>
          {emp.gender === 'M' ? t('hr.male') : emp.gender === 'F' ? t('hr.female') : t('hr.other')}
        </KV>
        <KV label={t('hr.birth')} mono>
          {fmtDate(emp.birthdate)}
        </KV>
        <KV label={t('hr.nid')} mono>
          <span className="sens-inline">
            <span>{nidDisplay()}</span>
            {canReveal && !nidMaskedByServer && nidRaw && (
              <button
                className="sens-btn-sm"
                onClick={onToggleNid}
                title={showNid ? t('hr.hide') : t('hr.reveal')}
              >
                {showNid ? Icons.eyeOff(11) : Icons.eye(11)}
              </button>
            )}
          </span>
        </KV>
      </OvGroup>

      <OvGroup icon={Icons.phone(13)} title={t('hr.contact')}>
        <KV label={t('hr.phone')} mono>
          {emp.phone || '—'}
        </KV>
        <KV label={t('hr.email')}>
          {emp.email ? (
            <a href={`mailto:${emp.email}`} className="lnk">
              {emp.email}
            </a>
          ) : (
            '—'
          )}
        </KV>
        <KV label={t('hr.address')}>
          <div style={{ whiteSpace: 'normal' }}>
            {addr.line1 || '—'}
            {addr.province && ` ${addr.province}`}
            {addr.postal && ` ${addr.postal}`}
          </div>
        </KV>
      </OvGroup>

      <OvGroup icon={Icons.briefcase(13)} title={t('hr.employment')}>
        <KV label={t('hr.company')}>
          {lang === 'th' ? emp.company_name_th : emp.company_name_en}
        </KV>
        <KV label={t('hr.department')}>
          {lang === 'th' ? emp.department_name_th : emp.department_name_en}
        </KV>
        <KV label={t('hr.position')}>
          {lang === 'th' ? emp.position_name_th : emp.position_name_en}
        </KV>
        <KV label={t('hr.etype')}>
          <span className="badge brand">{t(`hr.etype_${emp.employment_type}`)}</span>
        </KV>
        <KV label={t('hr.hiredAt')} mono>
          {fmtDate(emp.hired_at)}
        </KV>
        <KV label={t('hr.tenure')}>{tenureStr}</KV>
        {emp.terminated_at && (
          <KV label={t('hr.terminatedAt')} mono>
            {fmtDate(emp.terminated_at)}
          </KV>
        )}
        {emp.terminated_reason && <KV label={t('hr.terminatedReason')}>{emp.terminated_reason}</KV>}
      </OvGroup>

      <OvGroup
        icon={Icons.wallet(13)}
        title={t('hr.compensation')}
        rightTag={<span className="sens-tag">{t('hr.sensitive')}</span>}
      >
        <KV label={t('hr.salary')} mono>
          <span className="sens-inline">
            <span>{salaryDisplay()}</span>
            {canReveal && !salaryMaskedByServer && salaryRaw && (
              <button
                className="sens-btn-sm"
                onClick={onToggleSalary}
                title={showSalary ? t('hr.hide') : t('hr.reveal')}
              >
                {showSalary ? Icons.eyeOff(11) : Icons.eye(11)}
                <span style={{ marginLeft: 4 }}>{showSalary ? t('hr.hide') : t('hr.reveal')}</span>
              </button>
            )}
            {!canReveal && (
              <span className="t-xs t-dim" style={{ marginLeft: 6 }}>
                🔒 {lang === 'th' ? 'ไม่มีสิทธิ์' : 'no access'}
              </span>
            )}
          </span>
        </KV>
      </OvGroup>
    </div>
  )
}

function HistoryTab({ emp, lang }: { emp: Employee; lang: 'th' | 'en' }) {
  const { t } = useTranslation()
  type Item = { date: string; title: string; detail?: string; tone: string }
  const items: Item[] = []
  items.push({
    date: emp.hired_at.slice(0, 10),
    title: lang === 'th' ? 'เข้าร่วมบริษัท' : 'Hired',
    detail:
      lang === 'th'
        ? `ตำแหน่ง ${emp.position_name_th}, แผนก ${emp.department_name_th}`
        : `${emp.position_name_en}, ${emp.department_name_en}`,
    tone: 'ok',
  })
  if (emp.terminated_at) {
    items.push({
      date: emp.terminated_at.slice(0, 10),
      title: t('hr.terminatedAt'),
      detail: emp.terminated_reason ?? undefined,
      tone: 'bad',
    })
  }
  const ordered = items.slice().reverse()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {ordered.map((it, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 12,
            padding: 10,
            background: 'var(--bg-subtle)',
            borderRadius: 6,
            borderLeft: `3px solid var(--${it.tone === 'ok' ? 'ok' : 'bad'})`,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{it.title}</div>
            {it.detail && <div className="t-small t-muted" style={{ marginTop: 2 }}>{it.detail}</div>}
          </div>
          <div className="t-xs t-mono t-muted">{it.date}</div>
        </div>
      ))}
    </div>
  )
}

function OvGroup({
  icon,
  title,
  rightTag,
  children,
}: {
  icon: ReactNode
  title: string
  rightTag?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="ov-group">
      <div className="ov-group-hd">
        <span className="ov-ic">{icon}</span>
        {title}
        {rightTag}
      </div>
      <div className="kv-grid">{children}</div>
    </div>
  )
}

function KV({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="kv">
      <div className="kv-l">{label}</div>
      <div className={`kv-v ${mono ? 't-mono' : ''}`}>{children}</div>
    </div>
  )
}

// keep compiler happy for unused type
export type _DrawerTabs = EmployeeStatus
