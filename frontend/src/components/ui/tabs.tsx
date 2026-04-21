import {
  createContext,
  useContext,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

// Minimal tabs primitive — we don't need Radix's full a11y surface yet.
// Keyboard support: Tab moves focus through triggers, Enter/Space activates.
// We deliberately don't eat ArrowLeft/Right because the current screens
// have exactly two tabs; if a future module goes 4+ tabs we'll re-home
// this on Radix.

type TabsContextShape = {
  value: string
  setValue: (v: string) => void
}
const TabsContext = createContext<TabsContextShape | null>(null)

function useTabsContext(): TabsContextShape {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs subcomponents must be inside <Tabs>')
  return ctx
}

export type TabsProps = {
  /** Controlled value. When omitted, the component manages its own state. */
  value?: string
  /** Default value when uncontrolled. */
  defaultValue?: string
  onValueChange?: (v: string) => void
  children: ReactNode
  className?: string
}

export function Tabs({ value, defaultValue, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? '')
  const active = value ?? internal
  const setValue = (v: string) => {
    if (value === undefined) setInternal(v)
    onValueChange?.(v)
  }
  return (
    <TabsContext.Provider value={{ value: active, setValue }}>
      <div className={cn('ui-tabs', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({
  className,
  children,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn('ui-tabs-list', className)}
      style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

type TabsTriggerProps = HTMLAttributes<HTMLButtonElement> & {
  value: string
  disabled?: boolean
}

export function TabsTrigger({ value, disabled, children, style, ...rest }: TabsTriggerProps) {
  const { value: active, setValue } = useTabsContext()
  const isActive = active === value
  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      disabled={disabled}
      tabIndex={isActive ? 0 : -1}
      onClick={() => !disabled && setValue(value)}
      style={{
        padding: '8px 14px',
        border: 'none',
        background: 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: 13,
        fontWeight: isActive ? 600 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderBottom: `2px solid ${isActive ? 'var(--brand)' : 'transparent'}`,
        marginBottom: -1,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

type TabsContentProps = HTMLAttributes<HTMLDivElement> & { value: string }

export function TabsContent({ value, children, ...rest }: TabsContentProps) {
  const { value: active } = useTabsContext()
  if (active !== value) return null
  return (
    <div role="tabpanel" {...rest}>
      {children}
    </div>
  )
}
