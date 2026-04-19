import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'

const schema = z.object({ email: z.string().email() })
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [submitted, setSubmitted] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { email: '' },
  })

  const onSubmit = async (v: FormValues) => {
    setErr(null)
    setBusy(true)
    try {
      const parsed = schema.parse(v)
      await api<{ status: string }>('/api/v1/auth/password-reset/request', {
        method: 'POST',
        body: { email: parsed.email },
      })
      setSubmitted(true)
    } catch (e) {
      // The backend always returns 200 for the request endpoint to avoid
      // user-enumeration. Errors here are network-level only.
      setErr(e instanceof ApiError ? t('app.error') : t('app.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg-app)',
        padding: 16,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <CardHeader>
          <CardTitle style={{ fontSize: 15 }}>{t('auth.forgotTitle')}</CardTitle>
          <p className="t-xs t-muted" style={{ margin: '4px 0 0' }}>
            {t('auth.forgotSubtitle')}
          </p>
        </CardHeader>
        <CardBody>
          {submitted ? (
            <div
              role="status"
              style={{
                padding: 12,
                borderRadius: 4,
                border: '1px solid var(--ok)',
                background: 'var(--ok-bg, rgba(16,185,129,.08))',
                color: 'var(--ok)',
                fontSize: 13,
              }}
            >
              {t('auth.forgotSent')}
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(onSubmit)(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  {...register('email')}
                />
                {errors.email && (
                  <span className="t-xs" style={{ color: 'var(--bad)' }}>
                    {errors.email.message}
                  </span>
                )}
              </div>
              {err && (
                <div
                  role="alert"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 4,
                    border: '1px solid var(--bad)',
                    background: 'var(--bad-bg)',
                    color: 'var(--bad)',
                    fontSize: 12,
                  }}
                >
                  {err}
                </div>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? t('app.loading') : t('auth.forgotSubmit')}
              </Button>
            </form>
          )}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Link to="/login" className="t-xs t-muted">
              {t('auth.backToLogin')}
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
