import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'

export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (
    <div className="hr-page">
      <div className="page-hd" style={{ display: 'block', marginBottom: 16 }}>
        <div className="t-label" style={{ marginBottom: 2 }}>
          TRIMURTI
        </div>
        <h1 className="page-title">{t('nav.dashboard')}</h1>
        <p className="t-xs t-muted" style={{ marginTop: 4 }}>
          Signed in as <span className="t-mono">{user?.email}</span>
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Card>
          <CardHeader>
            <CardTitle>Phase 0 — Foundation</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="t-small t-muted" style={{ margin: 0 }}>
              Scaffold, auth, RBAC, audit, CI all live. See PROGRESS.md for the next module.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {user?.roles.map((r) => (
                <span key={r} className="badge brand">
                  {r}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardBody>
            <div style={{ maxHeight: 160, overflow: 'auto' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {user?.permissions.map((p) => (
                  <li key={p} className="t-mono t-xs t-muted" style={{ padding: '2px 0' }}>
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
