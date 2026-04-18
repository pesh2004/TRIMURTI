import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { useTranslation } from 'react-i18next'

export function AppLayout() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    if (!loading && !user) void navigate({ to: '/login', replace: true })
  }, [loading, user, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[color:var(--color-fg-muted)]">
        {t('app.loading')}
      </div>
    )
  }
  if (!user) return null

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto bg-[color:var(--color-bg)] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
