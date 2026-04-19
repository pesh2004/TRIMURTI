import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Icons } from './icons'
import { Avatar } from './Avatar'
import { StatusPill, EmploymentTypePill } from './pills'
import { Spark } from './Spark'
import {
  hrApi,
  type EmployeeFilters,
  type EmployeeListItem,
  type EmployeeStatus,
  type EmploymentType,
} from '@/lib/api/hr'
import { fmtMoney, tenureYears } from '@/lib/hr/format'

type SortKey = 'code' | 'name' | 'dept' | 'pos' | 'hired'
type SortDir = 'asc' | 'desc'
type KpiTone = 'brand' | 'ok' | 'warn' | 'bad'

const PER_PAGE = 25

export function EmployeeList({
  lang,
  onOpenDetail,
  onNew,
  onEdit,
}: {
  lang: 'th' | 'en'
  onOpenDetail: (id: number) => void
  onNew: () => void
  onEdit: (id: number) => void
}) {
  const { t } = useTranslation()
  const searchRef = useRef<HTMLInputElement>(null)

  const [q, setQ] = useState('')
  const [fCompany, setFCompany] = useState<number | ''>('')
  const [fDept, setFDept] = useState<number | ''>('')
  const [fPos, setFPos] = useState<number | ''>('')
  const [fEtype, setFEtype] = useState<EmploymentType | ''>('')
  const [fStatus, setFStatus] = useState<EmployeeStatus | ''>('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'code', dir: 'asc' })
  const [page, setPage] = useState(1)

  // keyboard: / focus search, n = new
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'n' || e.key === 'N') {
        onNew()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onNew])

  // Dropdowns: companies / departments / positions
  const companiesQ = useQuery({
    queryKey: ['hr', 'companies'],
    queryFn: () => hrApi.listCompanies(),
    staleTime: 60_000,
  })
  const departmentsQ = useQuery({
    queryKey: ['hr', 'departments', fCompany],
    queryFn: () => hrApi.listDepartments(fCompany === '' ? undefined : fCompany),
    staleTime: 60_000,
  })
  const positionsQ = useQuery({
    queryKey: ['hr', 'positions'],
    queryFn: () => hrApi.listPositions(),
    staleTime: 60_000,
  })

  const filters: EmployeeFilters = useMemo(
    () => ({
      q: q.trim() || undefined,
      company_id: fCompany === '' ? undefined : fCompany,
      department_id: fDept === '' ? undefined : fDept,
      position_id: fPos === '' ? undefined : fPos,
      employment_type: fEtype || undefined,
      status: activeOnly ? 'active' : fStatus || undefined,
      hired_from: fFrom || undefined,
      hired_to: fTo || undefined,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
    [q, fCompany, fDept, fPos, fEtype, fStatus, activeOnly, fFrom, fTo, page],
  )

  const listQ = useQuery({
    queryKey: ['hr', 'employees', filters],
    queryFn: () => hrApi.listEmployees(filters),
    placeholderData: keepPreviousData,
  })

  const items = listQ.data?.items ?? []
  const total = listQ.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const pageNow = Math.min(page, totalPages)
  const start = (pageNow - 1) * PER_PAGE

  // Client-side sort on current page (server returns code-desc by default).
  const shown = useMemo(() => {
    const list = items.slice()
    list.sort((a, b) => {
      let va: string, vb: string
      if (sort.key === 'name') {
        va = a.first_name_th + a.last_name_th
        vb = b.first_name_th + b.last_name_th
      } else if (sort.key === 'dept') {
        va = a.department_name_en
        vb = b.department_name_en
      } else if (sort.key === 'pos') {
        va = a.position_name_en
        vb = b.position_name_en
      } else if (sort.key === 'hired') {
        va = a.hired_at
        vb = b.hired_at
      } else {
        va = a.employee_code
        vb = b.employee_code
      }
      return (va < vb ? -1 : va > vb ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1)
    })
    return list
  }, [items, sort])

  const hasFilters =
    q || fCompany || fDept || fPos || fEtype || fStatus || fFrom || fTo || activeOnly

  const clearAll = () => {
    setQ('')
    setFCompany('')
    setFDept('')
    setFPos('')
    setFEtype('')
    setFStatus('')
    setFFrom('')
    setFTo('')
    setActiveOnly(false)
    setPage(1)
  }

  // KPIs — computed against the current page's view; good-enough for demo.
  const kpiActive = items.filter((e) => e.status === 'active' || e.status === 'on_leave').length
  const thisMonth = new Date().toISOString().slice(0, 7)
  const kpiNew = items.filter((e) => e.hired_at.startsWith(thisMonth)).length
  const kpiTerm = items.filter((e) => (e.terminated_at || '').startsWith(thisMonth)).length
  const avgTenure =
    items.length > 0
      ? items.reduce((s, e) => s + tenureYears(e.hired_at, e.terminated_at), 0) / items.length
      : 0

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const sortIcon = (key: SortKey) => {
    if (sort.key !== key) return <span className="sort-ic" style={{ opacity: 0.3 }}>{Icons.sort(11)}</span>
    return <span className="sort-ic">{sort.dir === 'asc' ? Icons.sortUp(11) : Icons.sortDn(11)}</span>
  }

  const exportCsv = () => {
    const rows = [
      ['Code', 'Name TH', 'Name EN', 'Dept', 'Position', 'Type', 'Hired', 'Status'],
      ...items.map((e) => [
        e.employee_code,
        `${e.first_name_th} ${e.last_name_th}`,
        `${e.first_name_en ?? ''} ${e.last_name_en ?? ''}`,
        e.department_name_en,
        e.position_name_en,
        e.employment_type,
        e.hired_at,
        e.status,
      ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="hr-page">
      <div className="page-hd">
        <div>
          <div className="t-label" style={{ marginBottom: 2 }}>{t('hr.title')}</div>
          <h1 className="page-title">{t('hr.list')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportCsv}>
            {Icons.download(14)}
            <span style={{ marginLeft: 6 }}>{t('hr.export')} CSV</span>
          </button>
          <button className="btn primary" onClick={onNew} title="N">
            {Icons.plus(14)}
            <span style={{ marginLeft: 6 }}>{t('hr.new')}</span>
            <kbd
              style={{
                marginLeft: 8,
                opacity: 0.8,
                padding: '1px 5px',
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 3,
                fontSize: 10,
                border: '1px solid rgba(255,255,255,0.25)',
                color: 'inherit',
              }}
            >
              N
            </kbd>
          </button>
        </div>
      </div>

      {/* KPIs — sparklines are visual-only synthetic trends for the demo */}
      <div className="kpi-row">
        <Kpi
          label={t('hr.kpiActive')}
          value={fmtMoney(kpiActive)}
          delta={2.4}
          tone="brand"
          series={[240, 245, 248, 252, 255, 260, 262, 265, 270, 272, kpiActive]}
        />
        <Kpi
          label={t('hr.kpiNew')}
          value={fmtMoney(kpiNew)}
          delta={50}
          tone="ok"
          series={[2, 3, 1, 4, 2, 3, 5, 2, 4, 3, kpiNew]}
        />
        <Kpi
          label={t('hr.kpiTerm')}
          value={fmtMoney(kpiTerm)}
          delta={-33.3}
          tone="bad"
          series={[3, 2, 4, 1, 3, 2, 1, 2, 3, 2, kpiTerm]}
        />
        <Kpi
          label={t('hr.kpiTenure')}
          value={avgTenure.toFixed(1)}
          unit={t('hr.years')}
          delta={1.2}
          tone="brand"
          series={[5.1, 5.2, 5.3, 5.4, 5.3, 5.5, 5.6, 5.6, 5.7, 5.8, avgTenure]}
        />
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="search-lg">
          {Icons.search(14)}
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder={t('hr.search')}
            className="search-in"
          />
          <kbd>/</kbd>
        </div>
        <select
          className="select sm"
          value={fCompany}
          onChange={(e) => {
            setFCompany(e.target.value ? Number(e.target.value) : '')
            setPage(1)
          }}
        >
          <option value="">
            {t('hr.all')} — {t('hr.company')}
          </option>
          {companiesQ.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {lang === 'th' ? c.name_th : c.name_en}
            </option>
          ))}
        </select>
        <select
          className="select sm"
          value={fDept}
          onChange={(e) => {
            setFDept(e.target.value ? Number(e.target.value) : '')
            setPage(1)
          }}
        >
          <option value="">
            {t('hr.all')} — {t('hr.department')}
          </option>
          {departmentsQ.data?.items.map((d) => (
            <option key={d.id} value={d.id}>
              {lang === 'th' ? d.name_th : d.name_en}
            </option>
          ))}
        </select>
        <select
          className="select sm"
          value={fPos}
          onChange={(e) => {
            setFPos(e.target.value ? Number(e.target.value) : '')
            setPage(1)
          }}
        >
          <option value="">
            {t('hr.all')} — {t('hr.position')}
          </option>
          {positionsQ.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {lang === 'th' ? p.name_th : p.name_en}
            </option>
          ))}
        </select>
        <select
          className="select sm"
          value={fEtype}
          onChange={(e) => {
            setFEtype((e.target.value as EmploymentType) || '')
            setPage(1)
          }}
        >
          <option value="">
            {t('hr.all')} — {t('hr.etype')}
          </option>
          {(['fulltime', 'contract', 'daily', 'parttime'] as const).map((x) => (
            <option key={x} value={x}>
              {t(`hr.etype_${x}`)}
            </option>
          ))}
        </select>
        <select
          className="select sm"
          value={fStatus}
          onChange={(e) => {
            setFStatus((e.target.value as EmployeeStatus) || '')
            setPage(1)
          }}
        >
          <option value="">
            {t('hr.all')} — {t('hr.status')}
          </option>
          {(['active', 'inactive', 'on_leave', 'terminated'] as const).map((x) => (
            <option key={x} value={x}>
              {t(`hr.status_${x}`)}
            </option>
          ))}
        </select>
        <div className="date-range">
          <span className="t-xs t-muted">{t('hr.hiredAt')}:</span>
          <input
            type="date"
            className="input sm"
            value={fFrom}
            onChange={(e) => {
              setFFrom(e.target.value)
              setPage(1)
            }}
          />
          <span className="t-xs t-muted">→</span>
          <input
            type="date"
            className="input sm"
            value={fTo}
            onChange={(e) => {
              setFTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => {
              setActiveOnly(e.target.checked)
              setPage(1)
            }}
          />
          <span>{t('hr.activeOnly')}</span>
        </label>
        {hasFilters && (
          <button className="btn ghost sm" onClick={clearAll}>
            {Icons.x(12)}
            <span style={{ marginLeft: 4 }}>{t('hr.clearFilters')}</span>
          </button>
        )}
      </div>

      {/* Results meta */}
      <div className="results-meta">
        <span className="t-xs t-muted">
          {t('hr.showing')}{' '}
          <b className="t-mono">
            {total === 0 ? 0 : start + 1}–{Math.min(start + PER_PAGE, total)}
          </b>{' '}
          {t('hr.of')} <b className="t-mono">{fmtMoney(total)}</b>
          {hasFilters && (
            <span style={{ marginLeft: 8, color: 'var(--hr-accent)' }}>
              • {lang === 'th' ? 'ตัวกรองทำงาน' : 'filters applied'}
            </span>
          )}
        </span>
        <span className="t-xs t-muted">
          {lang === 'th' ? 'ย่อคีย์บอร์ด:' : 'Shortcuts:'} <kbd>/</kbd> {lang === 'th' ? 'ค้นหา' : 'search'} ·{' '}
          <kbd>N</kbd> {lang === 'th' ? 'เพิ่มใหม่' : 'new'} · <kbd>E</kbd>{' '}
          {lang === 'th' ? 'แก้ไข' : 'edit'}
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="tbl hr-tbl">
          <thead>
            <tr>
              <th onClick={() => toggleSort('code')} className="sortable" style={{ width: 200 }}>
                <span>{t('hr.code')}</span> {sortIcon('code')}
              </th>
              <th style={{ width: 40 }}></th>
              <th onClick={() => toggleSort('name')} className="sortable">
                <span>{t('hr.name')}</span> {sortIcon('name')}
              </th>
              <th onClick={() => toggleSort('dept')} className="sortable" style={{ width: 180 }}>
                <span>{t('hr.department')}</span> {sortIcon('dept')}
              </th>
              <th onClick={() => toggleSort('pos')} className="sortable" style={{ width: 200 }}>
                <span>{t('hr.position')}</span> {sortIcon('pos')}
              </th>
              <th style={{ width: 120 }}>{t('hr.etype')}</th>
              <th onClick={() => toggleSort('hired')} className="sortable" style={{ width: 112 }}>
                <span>{t('hr.hiredAt')}</span> {sortIcon('hired')}
              </th>
              <th style={{ width: 120 }}>{t('hr.status')}</th>
              <th style={{ width: 80, textAlign: 'right' }}>{t('hr.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="sk-row">
                  {[180, 32, 240, 150, 170, 100, 100, 90, 60].map((w, j) => (
                    <td key={j}>
                      <div className="sk" style={{ width: w, height: 12 }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!listQ.isLoading && shown.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty">
                    <div style={{ fontSize: 32, color: 'var(--text-dim)' }}>{Icons.users(32)}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginTop: 8 }}>
                      {t('hr.noResults')}
                    </div>
                    <div className="t-xs t-muted" style={{ marginTop: 3 }}>
                      {t('hr.noResultsHint')}
                    </div>
                    {hasFilters && (
                      <button className="btn sm" style={{ marginTop: 12 }} onClick={clearAll}>
                        {t('hr.clearFilters')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {!listQ.isLoading &&
              shown.map((e) => <EmployeeRow key={e.id} e={e} lang={lang} onOpenDetail={onOpenDetail} onEdit={onEdit} />)}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pager">
        <span className="t-xs t-muted">
          {PER_PAGE} {t('hr.perPage')} · {t('hr.showing')} {total === 0 ? 0 : start + 1}–
          {Math.min(start + PER_PAGE, total)} {t('hr.of')} {fmtMoney(total)}
        </span>
        <div className="pages">
          <button className="pg" disabled={pageNow <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            {Icons.left(12)}
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
            let n: number
            if (totalPages <= 5) n = i + 1
            else if (pageNow <= 3) n = i + 1
            else if (pageNow >= totalPages - 2) n = totalPages - 4 + i
            else n = pageNow - 2 + i
            return (
              <button
                key={n}
                className={`pg ${n === pageNow ? 'active' : ''}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            )
          })}
          <button
            className="pg"
            disabled={pageNow >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {Icons.right(12)}
          </button>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  unit,
  delta,
  tone = 'brand',
  series,
}: {
  label: string
  value: string
  unit?: string
  delta?: number
  tone?: KpiTone
  series?: number[]
}) {
  const strokeVar =
    tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : 'var(--hr-accent)'
  const up = (delta ?? 0) >= 0
  return (
    <div className="kpi">
      <div className="kpi-head">{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="kpi-value">
            {value}
            {unit && <span className="unit">{unit}</span>}
          </div>
          <div className="kpi-sub">
            {delta !== undefined && (
              <span className="delta" style={{ color: up ? 'var(--ok)' : 'var(--bad)' }}>
                {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
              </span>
            )}
            <span className="t-muted">vs prev month</span>
          </div>
        </div>
        {series && <Spark data={series} w={80} h={28} stroke={strokeVar} />}
      </div>
    </div>
  )
}

function EmployeeRow({
  e,
  lang,
  onOpenDetail,
  onEdit,
}: {
  e: EmployeeListItem
  lang: 'th' | 'en'
  onOpenDetail: (id: number) => void
  onEdit: (id: number) => void
}) {
  return (
    <tr
      className="hr-row"
      onClick={() => onOpenDetail(e.id)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault()
          onOpenDetail(e.id)
        } else if (ev.key === 'e' || ev.key === 'E') {
          ev.preventDefault()
          onEdit(e.id)
        }
      }}
      tabIndex={0}
    >
      <td className="t-mono t-xs" style={{ color: 'var(--text-secondary)' }}>
        {e.employee_code}
      </td>
      <td>
        <Avatar firstEn={e.first_name_en} lastEn={e.last_name_en} seed={e.employee_code} size={28} />
      </td>
      <td>
        <div style={{ fontWeight: 500, lineHeight: 1.2 }}>
          {lang === 'th' ? `${e.first_name_th} ${e.last_name_th}` : `${e.first_name_en ?? ''} ${e.last_name_en ?? ''}`}
          {e.nickname && (
            <span className="t-xs t-muted" style={{ marginLeft: 6, fontWeight: 400 }}>
              ({e.nickname})
            </span>
          )}
        </div>
        <div className="t-xs t-dim" style={{ marginTop: 1, lineHeight: 1.2 }}>
          {lang === 'th' ? `${e.first_name_en ?? ''} ${e.last_name_en ?? ''}` : `${e.first_name_th} ${e.last_name_th}`}
        </div>
      </td>
      <td>
        <span className="dept-pill">
          {lang === 'th' ? e.department_name_th : e.department_name_en}
        </span>
      </td>
      <td>{lang === 'th' ? e.position_name_th : e.position_name_en}</td>
      <td>
        <EmploymentTypePill type={e.employment_type} />
      </td>
      <td className="t-mono t-xs">{e.hired_at.slice(0, 10)}</td>
      <td>
        <StatusPill status={e.status} />
      </td>
      <td style={{ textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
        <button className="icon-btn sm" onClick={() => onEdit(e.id)} title="Edit">
          {Icons.edit(13)}
        </button>
        <button className="icon-btn sm" title="Actions">
          {Icons.more(13)}
        </button>
      </td>
    </tr>
  )
}
