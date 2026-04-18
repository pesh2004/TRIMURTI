import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{t('nav.settings')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Phase 0 placeholder</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-[color:var(--color-fg-muted)]">
            Full settings module lands in Phase 1 (company, users, integrations).
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
