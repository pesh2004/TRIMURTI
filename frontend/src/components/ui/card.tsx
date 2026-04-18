import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(className)}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
      {...props}
    />
  )
}

export function CardHeader({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(className)}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
        ...style,
      }}
      {...props}
    />
  )
}

export function CardTitle({ className, style, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(className)}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: 0,
        ...style,
      }}
      {...props}
    />
  )
}

export function CardBody({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} style={{ padding: 14, ...style }} {...props} />
}
