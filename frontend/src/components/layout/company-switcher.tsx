import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api/settings'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/components/hr/Toast'

// CompanySwitcher renders nothing when the user belongs to a single company
// (the overwhelmingly common case — the single-tenant feel of a small
// construction firm). Once membership grows to 2+ the dropdown appears in
// the topbar without a config change.
export function CompanySwitcher() {
  const { t, i18n } = useTranslation()
  const { user, refresh } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (!user || !user.companies || user.companies.length < 2) return null

  const display = (c: { name_th: string; name_en: string }) =>
    i18n.language === 'th' ? c.name_th || c.name_en : c.name_en || c.name_th

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value)
    if (!id || id === user.active_company_id) return
    setBusy(true)
    try {
      await settingsApi.switchCompany(id)
      await refresh()
      // Blow every cached query — switching companies changes practically
      // every per-company list (employees, projects, settings). A narrow
      // invalidate would need a manifest of which queries are company-
      // scoped; broad invalidate is safer while the module catalogue is
      // still growing.
      await qc.invalidateQueries()
      const picked = user.companies.find((c) => c.id === id)
      if (picked) toast.push(t('settings.switcher.switched', { name: display(picked) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="role-switch"
      title={t('settings.switcher.label')}
      style={{ padding: 0, paddingRight: 6 }}
    >
      <span className="role-dot" />
      <select
        value={user.active_company_id}
        onChange={onChange}
        disabled={busy}
        aria-label={t('settings.switcher.label')}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontWeight: 500,
          padding: '4px 6px',
          color: 'inherit',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {user.companies.map((c) => (
          <option key={c.id} value={c.id}>
            {display(c)}
          </option>
        ))}
      </select>
    </div>
  )
}
