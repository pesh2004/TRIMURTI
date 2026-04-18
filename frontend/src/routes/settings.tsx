import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="hr-page">
      <h1 className="page-title" style={{ marginBottom: 16 }}>
        {t('nav.settings')}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Phase 0 placeholder</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="t-small t-muted" style={{ margin: 0 }}>
            Full settings module lands in Phase 1 (company, users, integrations).
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
