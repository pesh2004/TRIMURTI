import { useTranslation } from 'react-i18next'
import type { EmployeeStatus, EmploymentType } from '@/lib/api/hr'

const STATUS_TONE: Record<EmployeeStatus, string> = {
  active: 'ok',
  on_leave: 'warn',
  inactive: '',
  terminated: 'bad',
}

const ETYPE_TONE: Record<EmploymentType, string> = {
  fulltime: 'brand',
  contract: 'info',
  daily: 'warn',
  parttime: '',
}

export function StatusPill({ status }: { status: EmployeeStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`badge ${STATUS_TONE[status]}`}>
      <span className="dot" />
      {t(`hr.status_${status}`)}
    </span>
  )
}

export function EmploymentTypePill({ type }: { type: EmploymentType }) {
  const { t } = useTranslation()
  return <span className={`badge ${ETYPE_TONE[type]}`}>{t(`hr.etype_${type}`)}</span>
}
