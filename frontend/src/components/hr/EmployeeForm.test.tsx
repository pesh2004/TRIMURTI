import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderWithQueryClient } from '@/test/utils'

vi.mock('@/lib/api/hr', () => ({
  hrApi: {
    listCompanies: vi.fn(),
    listDepartments: vi.fn(),
    listPositions: vi.fn(),
    getEmployee: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
  },
}))

// Stub the auth context — every test here assumes a signed-in admin with
// the reveal_pii capability so the Salary field is editable.
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'admin@trimurti.local', roles: ['admin'], permissions: ['hr_employees.reveal_pii'] },
    hasPermission: (code: string) => code === 'hr_employees.reveal_pii',
  }),
}))

// ToastHost isn't mounted in the test tree, so the hook needs a fallback.
vi.mock('./Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
  ToastHost: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { EmployeeForm } from './EmployeeForm'
import { hrApi } from '@/lib/api/hr'

describe('EmployeeForm', () => {
  beforeEach(() => {
    vi.mocked(hrApi.listCompanies).mockResolvedValue({
      items: [{ id: 1, code: 'TMT', name_th: 'ตรีมูรติ', name_en: 'Trimurti', is_active: true }],
    })
    vi.mocked(hrApi.listDepartments).mockResolvedValue({
      items: [
        {
          id: 10,
          company_id: 1,
          code: 'ENG',
          name_th: 'วิศวกรรม',
          name_en: 'Engineering',
          is_active: true,
        },
      ],
    })
    vi.mocked(hrApi.listPositions).mockResolvedValue({
      items: [
        { id: 100, code: 'DEV', name_th: 'นักพัฒนา', name_en: 'Developer', level: 3, is_active: true },
      ],
    })
  })

  it('renders the New Employee header in create mode', async () => {
    renderWithQueryClient(
      <EmployeeForm lang="en" editingId={null} onCancel={() => {}} onSaved={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /new employee|เพิ่มพนักงาน/i }),
      ).toBeInTheDocument()
    })
  })

  it('populates the form from hrApi.getEmployee in edit mode', async () => {
    vi.mocked(hrApi.getEmployee).mockResolvedValue({
      id: 42,
      employee_code: 'TMT-260042',
      company_id: 1,
      department_id: 10,
      position_id: 100,
      first_name_th: 'สมชาย',
      last_name_th: 'ใจดี',
      first_name_en: 'Somchai',
      last_name_en: 'Jaidee',
      gender: 'M',
      birthdate: '1990-05-15',
      employment_type: 'fulltime',
      hired_at: '2022-01-03',
      status: 'active',
      created_at: '2022-01-03T00:00:00Z',
      updated_at: '2022-01-03T00:00:00Z',
    })

    renderWithQueryClient(
      <EmployeeForm lang="en" editingId={42} onCancel={() => {}} onSaved={() => {}} />,
    )

    await waitFor(() => {
      // Thai name is what appears in the name input (first_name_th field).
      const input = screen.getByDisplayValue('สมชาย')
      expect(input).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Somchai')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1990-05-15')).toBeInTheDocument()
  })
})
