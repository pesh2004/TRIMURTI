import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (v: FormValues) => {
    setSubmitError(null)
    setSubmitting(true)
    try {
      const parsed = schema.parse(v)
      await login(parsed.email, parsed.password)
      await navigate({ to: '/' })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setSubmitError(t('auth.locked'))
        else setSubmitError(t('auth.invalid'))
      } else {
        setSubmitError(t('app.error'))
      }
    } finally {
      setSubmitting(false)
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
      <Card style={{ width: '100%', maxWidth: 360 }}>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="logo-mark" style={{ width: 32, height: 32, fontSize: 14 }}>
              T
            </div>
            <div>
              <CardTitle style={{ fontSize: 15 }}>{t('app.name')}</CardTitle>
              <p className="t-xs t-muted" style={{ margin: '2px 0 0' }}>
                {t('auth.login')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && (
                <span className="t-xs" style={{ color: 'var(--bad)' }}>
                  {errors.email.message}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password && (
                <span className="t-xs" style={{ color: 'var(--bad)' }}>
                  {errors.password.message}
                </span>
              )}
            </div>
            {submitError && (
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
                {submitError}
              </div>
            )}
            <Button type="submit" disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? t('app.loading') : t('auth.submit')}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
