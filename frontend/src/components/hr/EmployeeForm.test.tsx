import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('submits create with gender + birthdate populated from the form', async () => {
    // Regression cage for Bug B class: silent field drop on submit. We
    // assert the actual body passed to hrApi.createEmployee contains both
    // gender and birthdate.
    vi.mocked(hrApi.createEmployee).mockResolvedValue({
      id: 99,
      employee_code: 'TMT-260099',
      company_id: 1,
      department_id: 10,
      position_id: 100,
      first_name_th: 'สมชาย',
      last_name_th: 'ใจดี',
      gender: 'M',
      birthdate: '1990-05-15',
      employment_type: 'fulltime',
      hired_at: '2025-01-01',
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    })

    const user = userEvent.setup()
    const onSaved = vi.fn()

    renderWithQueryClient(
      <EmployeeForm lang="en" editingId={null} onCancel={() => {}} onSaved={onSaved} />,
    )

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /new employee/i })).toBeInTheDocument(),
    )

    // Field labels aren't linked to inputs via htmlFor, so find inputs by
    // the field's label text + DOM traversal — close enough to the user's
    // mental model ("the input under the 'First name (Thai)' label").
    const labelledInput = (label: RegExp) => {
      const lbl = screen.getByText(label)
      const field = lbl.closest('.field') as HTMLElement | null
      const input = field?.querySelector('input')
      if (!input) throw new Error(`no input found under label ${label}`)
      return input
    }

    await user.type(labelledInput(/First name \(Thai\)/), 'สมชาย')
    await user.type(labelledInput(/Last name \(Thai\)/), 'ใจดี')

    // Date inputs need fireEvent.change — userEvent.type fights the
    // `type=date` input formatter.
    const birthdate = labelledInput(/Birthdate/) as HTMLInputElement
    fireEvent.change(birthdate, { target: { value: '1990-05-15' } })

    // Find the primary Save action. Matches either "Save & Close" (en) or
    // its Thai equivalent without being picky.
    const saveButtons = screen.getAllByRole('button', { name: /save|บันทึก/i })
    await user.click(saveButtons[saveButtons.length - 1])

    await waitFor(() => {
      expect(hrApi.createEmployee).toHaveBeenCalled()
    })

    const body = vi.mocked(hrApi.createEmployee).mock.calls[0][0]
    expect(body.gender).toBe('M')
    expect(body.birthdate).toBe('1990-05-15')
    expect(body.first_name_th).toBe('สมชาย')
    expect(body.last_name_th).toBe('ใจดี')
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
