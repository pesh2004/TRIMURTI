import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'

const schema = z
  .object({
    new_password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((v) => v.new_password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })

type FormValues = z.infer<typeof schema>

export function PasswordResetPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The route definition (router.tsx) exposes ?token= as search params.
  const search = useSearch({ strict: false }) as { token?: string }
  const token = search.token ?? ''

  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { new_password: '', confirm: '' },
  })

  const onSubmit = async (v: FormValues) => {
    setErr(null)
    setBusy(true)
    try {
      const parsed = schema.parse(v)
      await api<{ status: string }>('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: { token, new_password: parsed.new_password },
      })
      setDone(true)
      setTimeout(() => void navigate({ to: '/login' }), 1500)
    } catch (e) {
      if (e instanceof ApiError) {
        // Backend returns a clear message for invalid/expired token.
        setErr(typeof e.body === 'object' && e.body && 'message' in e.body ? String((e.body as { message: unknown }).message) : t('auth.resetError'))
      } else {
        setErr(t('app.error'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
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
            <CardTitle style={{ fontSize: 15 }}>{t('auth.resetTitle')}</CardTitle>
          </CardHeader>
          <CardBody>
            <div
              role="alert"
              style={{
                padding: 12,
                borderRadius: 4,
                border: '1px solid var(--bad)',
                background: 'var(--bad-bg)',
                color: 'var(--bad)',
                fontSize: 13,
              }}
            >
              {t('auth.resetMissingToken')}
            </div>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Link to="/forgot-password" className="t-xs t-muted">
                {t('auth.forgotTitle')}
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    )
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
          <CardTitle style={{ fontSize: 15 }}>{t('auth.resetTitle')}</CardTitle>
          <p className="t-xs t-muted" style={{ margin: '4px 0 0' }}>
            {t('auth.resetSubtitle')}
          </p>
        </CardHeader>
        <CardBody>
          {done ? (
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
              {t('auth.resetDone')}
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(onSubmit)(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label htmlFor="new_password">{t('auth.newPassword')}</Label>
                <Input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  {...register('new_password')}
                />
                {errors.new_password && (
                  <span className="t-xs" style={{ color: 'var(--bad)' }}>
                    {errors.new_password.message}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label htmlFor="confirm">{t('auth.confirmPassword')}</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirm')}
                />
                {errors.confirm && (
                  <span className="t-xs" style={{ color: 'var(--bad)' }}>
                    {errors.confirm.message}
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
                {busy ? t('app.loading') : t('auth.resetSubmit')}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
