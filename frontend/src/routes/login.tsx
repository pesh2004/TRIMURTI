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
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-bg)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('app.name')}</CardTitle>
          <p className="text-xs text-[color:var(--color-fg-muted)]">{t('auth.login')}</p>
        </CardHeader>
        <CardBody>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && (
                <span className="text-xs text-[color:var(--color-bad)]">{errors.email.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password && (
                <span className="text-xs text-[color:var(--color-bad)]">{errors.password.message}</span>
              )}
            </div>
            {submitError && (
              <div
                role="alert"
                className="rounded border border-[color:var(--color-bad)] bg-[color:var(--color-bad-bg)] p-2 text-xs text-[color:var(--color-bad)]"
              >
                {submitError}
              </div>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? t('app.loading') : t('auth.submit')}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
