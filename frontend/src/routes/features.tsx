import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  features,
  liveCount,
  type Feature,
  type FeatureStatus,
} from '@/lib/features/catalog'

const STATUS_TONE: Record<FeatureStatus, string> = {
  live: 'ok',
  preview: 'brand',
  planned: '',
}

function statusLabel(status: FeatureStatus, lang: 'th' | 'en'): string {
  if (lang === 'th') {
    return status === 'live' ? 'ใช้งานจริงแล้ว' : status === 'preview' ? 'พรีวิว' : 'แผนพัฒนา'
  }
  return status === 'live' ? 'Live' : status === 'preview' ? 'Preview' : 'Planned'
}

export function FeaturesPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'th' | 'en'
  const live = liveCount()
  const total = features.length

  return (
    <div className="hr-page">
      <div className="page-hd" style={{ display: 'block', marginBottom: 16 }}>
        <div className="t-label" style={{ marginBottom: 2 }}>
          TRIMURTI
        </div>
        <h1 className="page-title">{t('features.title')}</h1>
        <p className="t-xs t-muted" style={{ marginTop: 4, maxWidth: 640 }}>
          {t('features.subtitle')}
        </p>
        <div className="t-xs t-muted" style={{ marginTop: 8 }}>
          <span className="badge ok">
            <span className="dot" /> {live} / {total}&nbsp;
            {lang === 'th' ? 'ฟีเจอร์พร้อมใช้' : 'features live'}
          </span>
        </div>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = features.filter((f) => f.category === cat)
        if (items.length === 0) return null
        return (
          <section key={cat} style={{ marginBottom: 20 }}>
            <h2 className="t-label" style={{ marginBottom: 8, fontSize: 12, letterSpacing: 0.5 }}>
              {CATEGORY_LABELS[cat][lang]}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 12,
              }}
            >
              {items.map((f) => (
                <FeatureCard key={f.id} feature={f} lang={lang} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function FeatureCard({ feature: f, lang }: { feature: Feature; lang: 'th' | 'en' }) {
  const title = lang === 'th' ? f.title_th : f.title_en
  const summary = lang === 'th' ? f.summary_th : f.summary_en
  const highlights = lang === 'th' ? f.highlights_th : f.highlights_en
  return (
    <Card style={{ height: '100%' }}>
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <CardTitle style={{ fontSize: 14 }}>{title}</CardTitle>
          <span className={`badge ${STATUS_TONE[f.status]}`}>
            {f.status === 'live' && <span className="dot" />}
            {statusLabel(f.status, lang)}
          </span>
        </div>
        {f.since && (
          <div className="t-xs t-dim" style={{ marginTop: 2 }}>
            {f.since}
          </div>
        )}
      </CardHeader>
      <CardBody>
        <p className="t-small" style={{ margin: 0, color: 'var(--text)' }}>
          {summary}
        </p>
        {highlights && highlights.length > 0 && (
          <ul
            style={{
              marginTop: 10,
              marginBottom: 0,
              paddingLeft: 18,
              fontSize: 12,
              color: 'var(--text-dim)',
              lineHeight: 1.55,
            }}
          >
            {highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
