import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

function classFor(variant: Variant = 'primary', size: Size = 'md'): string {
  const base = 'btn'
  const variantCls =
    variant === 'primary' ? 'primary'
      : variant === 'ghost' ? 'ghost'
      : variant === 'danger' ? 'danger'
      : variant === 'outline' ? '' // default .btn has border
      : '' // secondary → default look
  const sizeCls = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : ''
  return [base, variantCls, sizeCls].filter(Boolean).join(' ')
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(classFor(variant, size), size === 'icon' && 'icon-btn', className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
