import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [exporting, setExporting] = useState(false)

  // PDPA data-subject-access: download everything-about-me as a JSON file.
  // We bypass the shared api() wrapper because the response is a file, not
  // JSON to parse — let the browser save it via Content-Disposition.
  const onExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/v1/me/export', { credentials: 'include' })
      if (!res.ok) throw new Error(`export failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      // Filename comes from the server's Content-Disposition; fallback shows
      // the user id in case the header is stripped by a proxy.
      link.download = `trimurti-export-user-${user?.id ?? 'me'}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="hr-page">
      <div className="page-hd" style={{ display: 'block', marginBottom: 16 }}>
        <div className="t-label" style={{ marginBottom: 2 }}>
          TRIMURTI
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h1 className="page-title">{t('nav.dashboard')}</h1>
            <p className="t-xs t-muted" style={{ marginTop: 4 }}>
              Signed in as <span className="t-mono">{user?.email}</span>
            </p>
          </div>
          <Button variant="ghost" onClick={onExport} disabled={exporting} title={t('me.exportHint')}>
            {exporting ? t('app.loading') : t('me.exportButton')}
          </Button>
        </div>
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
