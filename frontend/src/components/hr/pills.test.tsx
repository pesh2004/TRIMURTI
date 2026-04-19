import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill, EmploymentTypePill } from './pills'

describe('StatusPill', () => {
  it('renders Active label for active status', () => {
    render(<StatusPill status="active" />)
    expect(screen.getByText(/active/i)).toBeInTheDocument()
  })

  it('renders Terminated with the "bad" tone class', () => {
    const { container } = render(<StatusPill status="terminated" />)
    const badge = container.querySelector('.badge')
    expect(badge).toHaveClass('bad')
    expect(screen.getByText(/terminated/i)).toBeInTheDocument()
  })

  it('renders On Leave with the warn tone', () => {
    const { container } = render(<StatusPill status="on_leave" />)
    expect(container.querySelector('.badge')).toHaveClass('warn')
  })
})

describe('EmploymentTypePill', () => {
  it('renders Full-time label for fulltime', () => {
    render(<EmploymentTypePill type="fulltime" />)
    expect(screen.getByText(/full-time/i)).toBeInTheDocument()
  })

  it('applies info tone to contract employees', () => {
    const { container } = render(<EmploymentTypePill type="contract" />)
    expect(container.querySelector('.badge')).toHaveClass('info')
  })
})
