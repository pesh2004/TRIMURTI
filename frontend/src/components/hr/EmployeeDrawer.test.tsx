import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { renderWithQueryClient } from '@/test/utils'

vi.mock('@/lib/api/hr', () => ({
  hrApi: {
    getEmployee: vi.fn(),
    terminateEmployee: vi.fn(),
  },
}))

// Drawer uses useAuth().hasPermission to decide whether Reveal / Terminate
// are visible. Expose a mutable permission set so individual tests can
// toggle admin vs plain reader.
const perms = new Set<string>()
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'x@y.z', roles: [], permissions: Array.from(perms) },
    hasPermission: (code: string) => perms.has(code),
  }),
}))

vi.mock('./Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
  ToastHost: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { EmployeeDrawer } from './EmployeeDrawer'
import { hrApi } from '@/lib/api/hr'

const fixture = {
  id: 42,
  employee_code: 'TMT-260042',
  company_id: 1,
  department_id: 10,
  position_id: 100,
  company_name_en: 'Trimurti',
  company_name_th: 'ตรีมูรติ',
  department_name_en: 'Engineering',
  department_name_th: 'วิศวกรรม',
  position_name_en: 'Developer',
  position_name_th: 'นักพัฒนา',
  first_name_th: 'สมชาย',
  last_name_th: 'ใจดี',
  first_name_en: 'Somchai',
  last_name_en: 'Jaidee',
  gender: 'M' as const,
  birthdate: '1990-05-15',
  employment_type: 'fulltime' as const,
  hired_at: '2022-01-03',
  status: 'active' as const,
  national_id: '•••••••••0123', // already masked (server-side)
  salary: '•••••',
  created_at: '2022-01-03T00:00:00Z',
  updated_at: '2022-01-03T00:00:00Z',
}

describe('EmployeeDrawer', () => {
  beforeEach(() => {
    perms.clear()
    vi.mocked(hrApi.getEmployee).mockResolvedValue(fixture)
  })

  it('renders employee header once the query resolves', async () => {
    renderWithQueryClient(
      <EmployeeDrawer lang="en" employeeId={42} onClose={() => {}} onEdit={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByText(/TMT-260042/)).toBeInTheDocument()
    })
    // "Somchai" and "Jaidee" both appear in header + subtitle — just assert
    // at least one occurrence of each.
    expect(screen.getAllByText(/Somchai/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Jaidee/).length).toBeGreaterThan(0)
  })

  it('closes via Escape keypress', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    renderWithQueryClient(
      <EmployeeDrawer lang="en" employeeId={42} onClose={onClose} onEdit={() => {}} />,
    )

    await waitFor(() => expect(screen.getByText(/TMT-260042/)).toBeInTheDocument())

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Terminate action only when the caller holds hr_employees.terminate', async () => {
    // First pass: no perms → Terminate button should be absent.
    const { unmount } = renderWithQueryClient(
      <EmployeeDrawer lang="en" employeeId={42} onClose={() => {}} onEdit={() => {}} />,
    )
    await waitFor(() => expect(screen.getByText(/TMT-260042/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /terminate|เลิกจ้าง/i })).not.toBeInTheDocument()
    unmount()

    // Second pass: grant the permission and re-render.
    perms.add('hr_employees.terminate')
    renderWithQueryClient(
      <EmployeeDrawer lang="en" employeeId={42} onClose={() => {}} onEdit={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /terminate|เลิกจ้าง/i })).toBeInTheDocument()
    })
  })
})
