import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CompanyProfileForm } from '@/components/settings/CompanyProfileForm'
import { IntegrationsTable } from '@/components/settings/IntegrationsTable'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="hr-page">
      <div className="page-hd" style={{ display: 'block', marginBottom: 16 }}>
        <div className="t-label" style={{ marginBottom: 2 }}>TRIMURTI</div>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="t-xs t-muted" style={{ marginTop: 4 }}>{t('settings.subtitle')}</p>
      </div>
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">{t('settings.tabs.company')}</TabsTrigger>
          <TabsTrigger value="integrations">{t('settings.tabs.integrations')}</TabsTrigger>
        </TabsList>
        <TabsContent value="company">
          <CompanyProfileForm />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
