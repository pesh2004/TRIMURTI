import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'

/**
 * Dashboard placeholder for Phase 0. Real implementation (5 sub-pages:
 * Overview, Projects, Financial, Sales pipeline, HSE) lands in Phase 1.
 */
export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t('nav.dashboard')}</h1>
        <p className="text-xs text-[color:var(--color-fg-muted)]">
          Signed in as <span className="font-mono">{user?.email}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Phase 0 — Foundation</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-[color:var(--color-fg-muted)]">
              Scaffold, auth, RBAC, audit, CI all live. See PROGRESS.md for the next
              module to build.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-wrap gap-1">
              {user?.roles.map((r) => (
                <li
                  key={r}
                  className="rounded bg-[color:var(--color-surface-2)] px-2 py-0.5 font-mono text-xs"
                >
                  {r}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="max-h-40 overflow-auto">
              <ul className="space-y-0.5">
                {user?.permissions.map((p) => (
                  <li key={p} className="font-mono text-xs text-[color:var(--color-fg-muted)]">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
