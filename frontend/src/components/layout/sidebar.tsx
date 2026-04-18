import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Icons } from '@/components/hr/icons'
import { cn } from '@/lib/cn'
import { hrApi } from '@/lib/api/hr'
import { useAuth } from '@/lib/auth'

type Item = {
  id: string
  to?: string
  th: string
  en: string
  icon: ReactNode
  count?: number
}
type Group = { id: string; th: string; en: string; items: Item[] }

export function Sidebar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const lang = i18n.language as 'th' | 'en'

  // Live count for HR → Employees pill.
  const empCountQ = useQuery({
    queryKey: ['hr', 'employees', { limit: 1, offset: 0 }],
    queryFn: () => hrApi.listEmployees({ limit: 1, offset: 0 }),
    staleTime: 30_000,
  })
  const empCount = empCountQ.data?.total

  const groups: Group[] = useMemo(
    () => [
      {
        id: 'workspace',
        th: 'เวิร์กสเปซ',
        en: 'Workspace',
        items: [
          { id: 'dashboard', to: '/', th: 'แดชบอร์ด', en: 'Dashboard', icon: Icons.building(14) },
        ],
      },
      {
        id: 'hr',
        th: 'ทรัพยากรบุคคล',
        en: 'Human Resources',
        items: [
          {
            id: 'hr_employees',
            to: '/hr-employees',
            th: 'พนักงาน',
            en: 'Employees',
            icon: Icons.users(14),
            count: empCount,
          },
        ],
      },
      {
        id: 'system',
        th: 'ระบบ',
        en: 'System',
        items: [
          { id: 'settings', to: '/settings', th: 'ตั้งค่า', en: 'Settings', icon: Icons.building(14) },
        ],
      },
    ],
    [empCount],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) => it.th.toLowerCase().includes(q) || it.en.toLowerCase().includes(q) || it.id.includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, query])

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo-mark">T</div>
        <div className="logo-text">
          TRIMURTI
          <small>Construction ERP</small>
        </div>
      </div>

      <div style={{ padding: '10px 10px 0' }}>
        <div className="search-lg" style={{ height: 28 }}>
          {Icons.search(12)}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nav.search')}
            className="search-in"
            style={{ fontSize: 12 }}
          />
        </div>
      </div>

      <nav className="sidebar-nav">
        {filtered.map((g) => (
          <div key={g.id}>
            <div className="nav-section">{lang === 'th' ? g.th : g.en}</div>
            {g.items.map((it) => {
              const active =
                it.to && (it.to === '/' ? pathname === '/' : pathname.startsWith(it.to))
              const content = (
                <>
                  <span style={{ color: 'var(--text-on-dark-muted)' }}>{it.icon}</span>
                  <span>{lang === 'th' ? it.th : it.en}</span>
                  {it.count != null && <span className="nav-count">{it.count}</span>}
                </>
              )
              return it.to ? (
                <Link key={it.id} to={it.to} className={cn('nav-item', active && 'active')}>
                  {content}
                </Link>
              ) : (
                <span key={it.id} className="nav-item" style={{ cursor: 'default', opacity: 0.6 }}>
                  {content}
                </span>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar-me">
          {(user?.display_name ?? 'U').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 500 }} className="truncate">
            {user?.display_name ?? '—'}
          </div>
          <div style={{ fontSize: 10 }}>{user?.roles[0] ?? ''}</div>
        </div>
      </div>
    </aside>
  )
}
