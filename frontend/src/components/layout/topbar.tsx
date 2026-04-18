import { useTranslation } from 'react-i18next'
import { Moon, Sun, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { applyTheme, initialTheme, type Theme } from '@/lib/theme'
import { setLanguage, type Lang } from '@/lib/i18n'

export function Topbar() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const [theme, setTheme] = useState<Theme>(initialTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = () => setTheme((p) => (p === 'dark' ? 'light' : 'dark'))
  const toggleLang = () => setLanguage((i18n.language as Lang) === 'th' ? 'en' : 'th')

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4">
      <div className="flex items-center gap-2 text-sm text-[color:var(--color-fg-muted)]">
        {user?.roles.length ? (
          <span className="rounded bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
            {user.roles[0]}
          </span>
        ) : null}
        <span className="font-medium text-[color:var(--color-fg)]">{user?.display_name}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={toggleLang} aria-label={t('nav.toggleLang')}>
          {i18n.language === 'th' ? 'TH' : 'EN'}
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t('nav.toggleTheme')}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label={t('auth.logout')}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
