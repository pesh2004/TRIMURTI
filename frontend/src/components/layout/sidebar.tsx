import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'
import { LayoutDashboard, Settings as SettingsIcon, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Input } from '@/components/ui/input'

/** Module registry. Phase 0 only wires dashboard + settings; the rest surface as
 *  grouped placeholders so the 17-group shell from the prototype is immediately
 *  visible. Each Phase 1+ module replaces its entry with a live route. */
type ModuleEntry = {
  id: string
  to?: string
  labelKey: string
  defaultLabel: string
  groupKey: string
}

const modules: ModuleEntry[] = [
  { id: 'dashboard', to: '/', labelKey: 'nav.dashboard', defaultLabel: 'Dashboard', groupKey: 'workspace' },
  { id: 'settings', to: '/settings', labelKey: 'nav.settings', defaultLabel: 'Settings', groupKey: 'system' },
]

const groupOrder = [
  'workspace',
  'exec',
  'sales',
  'crm',
  'proj',
  'ops',
  'docs',
  'proc',
  'inv',
  'eq',
  'sub',
  'hr',
  'fin',
  'risk',
  'gov',
  'bi',
  'system',
] as const

export function Sidebar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byGroup = new Map<string, ModuleEntry[]>()
    for (const m of modules) {
      if (q && !m.defaultLabel.toLowerCase().includes(q) && !m.id.includes(q)) continue
      const arr = byGroup.get(m.groupKey) ?? []
      arr.push(m)
      byGroup.set(m.groupKey, arr)
    }
    return groupOrder
      .map((g) => ({ key: g, entries: byGroup.get(g) ?? [] }))
      .filter((g) => g.entries.length > 0)
  }, [query])

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
      <div className="flex h-14 items-center gap-2 border-b border-[color:var(--color-border)] px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-[color:var(--color-accent)] font-bold text-[color:var(--color-accent-fg)]">
          T
        </div>
        <span className="text-sm font-semibold">{t('app.name')}</span>
      </div>

      <div className="border-b border-[color:var(--color-border)] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-fg-subtle)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nav.search')}
            className="pl-8"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 text-sm">
        {grouped.map((g) => (
          <div key={g.key} className="mb-3">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-fg-subtle)]">
              {t(`groups.${g.key}`)}
            </div>
            <ul>
              {g.entries.map((m) => {
                const active = m.to && (m.to === '/' ? pathname === '/' : pathname.startsWith(m.to))
                return (
                  <li key={m.id}>
                    {m.to ? (
                      <Link
                        to={m.to}
                        className={cn(
                          'flex items-center gap-2 rounded px-2 py-1.5 text-[color:var(--color-fg-muted)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-fg)]',
                          active && 'bg-[color:var(--color-surface-2)] text-[color:var(--color-fg)]',
                        )}
                      >
                        <ModuleIcon id={m.id} />
                        <span>{t(m.labelKey, m.defaultLabel)}</span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2 rounded px-2 py-1.5 text-[color:var(--color-fg-subtle)]">
                        <ModuleIcon id={m.id} />
                        <span>{t(m.labelKey, m.defaultLabel)}</span>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--color-border)] px-4 py-2 text-[10px] text-[color:var(--color-fg-subtle)]">
        {modules.length} modules loaded
      </div>
    </aside>
  )
}

function ModuleIcon({ id }: { id: string }) {
  const cls = 'h-4 w-4'
  if (id === 'dashboard') return <LayoutDashboard className={cls} />
  if (id === 'settings') return <SettingsIcon className={cls} />
  return <div className={cn(cls, 'rounded-sm bg-[color:var(--color-border-strong)]')} />
}
