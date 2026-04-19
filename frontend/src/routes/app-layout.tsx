import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { ToastHost } from '@/components/hr/Toast'

export function AppLayout() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    if (!loading && !user) void navigate({ to: '/login', replace: true })
  }, [loading, user, navigate])

  if (loading) {
    return (
      <div className="empty-sm t-muted" style={{ marginTop: '40vh' }}>
        {t('app.loading')}
      </div>
    )
  }
  if (!user) return null

  return (
    <ToastHost>
      <div className="app">
        <Sidebar />
        <Topbar />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </ToastHost>
  )
}
