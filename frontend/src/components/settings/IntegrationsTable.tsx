import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { settingsApi, type IntegrationsStatus } from '@/lib/api/settings'

type Row = {
  key: string
  name: string
  configured: boolean
  details: string
}

function rowsFrom(t: (k: string, o?: Record<string, unknown>) => string, s: IntegrationsStatus): Row[] {
  return [
    {
      key: 'smtp',
      name: t('settings.integrations.smtp'),
      configured: s.smtp.configured,
      details: s.smtp.configured
        ? t('settings.integrations.smtpDetails', { host: s.smtp.host, port: s.smtp.port, from: s.smtp.from })
        : t('settings.integrations.smtpNotConfigured'),
    },
    {
      key: 'storage',
      name: t('settings.integrations.storage'),
      configured: true,
      details: s.storage.mode,
    },
    {
      key: 'payment',
      name: t('settings.integrations.payment'),
      configured: s.payment.configured,
      details: s.payment.note,
    },
    {
      key: 'e_tax',
      name: t('settings.integrations.eTax'),
      configured: s.e_tax.configured,
      details: s.e_tax.note,
    },
  ]
}

export function IntegrationsTable() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['settings.integrations'], queryFn: settingsApi.getIntegrations })

  if (q.isLoading) return <p className="t-small t-muted">{t('app.loading')}</p>
  if (q.isError || !q.data) return <p className="t-small t-muted">{t('app.error')}</p>

  const rows = rowsFrom(t, q.data)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.tabs.integrations')}</CardTitle>
      </CardHeader>
      <CardBody>
        <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('settings.integrations.service')}</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('settings.integrations.status')}</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('settings.integrations.details')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.name}</td>
                <td style={{ padding: '6px 8px' }}>
                  <span
                    className="badge"
                    style={{
                      background: r.configured ? 'var(--bg-success, #22c55e22)' : 'var(--bg-subtle)',
                      color: r.configured ? 'var(--success, #16a34a)' : 'var(--text-muted)',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                    }}
                  >
                    {r.configured
                      ? t('settings.integrations.configured')
                      : t('settings.integrations.notConfigured')}
                  </span>
                </td>
                <td className="t-xs t-muted" style={{ padding: '6px 8px' }}>
                  {r.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}
