import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from '@tanstack/react-router'
import { Icons } from '@/components/hr/icons'
import { useAuth } from '@/lib/auth'
import { applyTheme, initialTheme, type Theme } from '@/lib/theme'
import { setLanguage, type Lang } from '@/lib/i18n'
import { CompanySwitcher } from './company-switcher'

export function Topbar() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const lang = i18n.language as Lang
  const [theme, setTheme] = useState<Theme>(initialTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const crumbs = pathname.startsWith('/hr-employees')
    ? [t('hr.title'), t('hr.list')]
    : pathname.startsWith('/settings')
      ? [t('nav.settings')]
      : [t('nav.dashboard')]

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>{Icons.building(13)}</span>
        <span>TRIMURTI</span>
        {crumbs.slice(0, -1).map((c, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span className="sep">/</span>
            <span>{c}</span>
          </span>
        ))}
        <span className="sep">/</span>
        <span className="cur">{crumbs[crumbs.length - 1]}</span>
      </div>
      <div className="topbar-actions">
        <div className="role-switch" title={user?.roles.join(', ')}>
          <span className="role-dot" />
          <span style={{ fontWeight: 500 }}>{user?.roles[0] ?? '—'}</span>
        </div>
        <CompanySwitcher />
        <button
          className="theme-btn"
          onClick={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
          title={t('nav.toggleTheme')}
        >
          {theme === 'dark' ? Icons.sun(14) : Icons.moon(14)}
        </button>
        <div className="lang-switch">
          <button className={lang === 'th' ? 'active' : ''} onClick={() => setLanguage('th')}>
            TH
          </button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>
            EN
          </button>
        </div>
        <button
          className="theme-btn"
          onClick={() => void logout()}
          title={t('auth.logout')}
          aria-label={t('auth.logout')}
        >
          {Icons.logout(14)}
        </button>
      </div>
    </header>
  )
}
