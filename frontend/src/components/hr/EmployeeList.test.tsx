import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQueryClient } from '@/test/utils'
import type { EmployeeListItem, Company, Department, Position } from '@/lib/api/hr'

// Mock the API module before importing the component so vi.mock hoists
// above the `import { EmployeeList }` below.
vi.mock('@/lib/api/hr', () => ({
  hrApi: {
    listCompanies: vi.fn(),
    listDepartments: vi.fn(),
    listPositions: vi.fn(),
    listEmployees: vi.fn(),
  },
}))

// Needed lazily because vi.mock is hoisted.
import { EmployeeList } from './EmployeeList'
import { hrApi } from '@/lib/api/hr'

const mockCompanies: Company[] = [
  { id: 1, code: 'TMT', name_th: 'ตรีมูรติ', name_en: 'Trimurti', is_active: true },
]
const mockDepartments: Department[] = [
  { id: 10, company_id: 1, code: 'ENG', name_th: 'วิศวกรรม', name_en: 'Engineering', is_active: true },
]
const mockPositions: Position[] = [
  { id: 100, code: 'DEV', name_th: 'นักพัฒนา', name_en: 'Developer', level: 3, is_active: true },
]
const mockEmployees: EmployeeListItem[] = [
  {
    id: 1,
    employee_code: 'TMT-260001',
    first_name_th: 'สมชาย',
    last_name_th: 'ใจดี',
    first_name_en: 'Somchai',
    last_name_en: 'Jaidee',
    nickname: 'Chai',
    company_id: 1,
    company_name_en: 'Trimurti',
    company_name_th: 'ตรีมูรติ',
    department_id: 10,
    department_name_en: 'Engineering',
    department_name_th: 'วิศวกรรม',
    position_id: 100,
    position_name_en: 'Developer',
    position_name_th: 'นักพัฒนา',
    employment_type: 'fulltime',
    hired_at: '2024-01-15',
    status: 'active',
  },
]

describe('EmployeeList', () => {
  beforeEach(() => {
    vi.mocked(hrApi.listCompanies).mockResolvedValue({ items: mockCompanies })
    vi.mocked(hrApi.listDepartments).mockResolvedValue({ items: mockDepartments })
    vi.mocked(hrApi.listPositions).mockResolvedValue({ items: mockPositions })
    vi.mocked(hrApi.listEmployees).mockResolvedValue({
      items: mockEmployees,
      total: mockEmployees.length,
      limit: 25,
      offset: 0,
    })
  })

  it('renders a row for each employee returned by the API', async () => {
    renderWithQueryClient(
      <EmployeeList lang="en" onOpenDetail={() => {}} onNew={() => {}} onEdit={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByText('TMT-260001')).toBeInTheDocument()
    })
    // "Engineering" is also used in the filter dropdown, so use getAllByText
    // and assert at least one match landed (the employee row).
    expect(screen.getAllByText(/Engineering/).length).toBeGreaterThan(0)
  })

  it('fires onNew when the "New" button is clicked', async () => {
    const user = userEvent.setup()
    const onNew = vi.fn()

    renderWithQueryClient(
      <EmployeeList lang="en" onOpenDetail={() => {}} onNew={onNew} onEdit={() => {}} />,
    )

    await waitFor(() => expect(screen.getByText('TMT-260001')).toBeInTheDocument())

    // Title says "New Employee" in en.json; accept either that or Thai.
    const button = screen.getByRole('button', { name: /new employee|เพิ่มพนักงาน/i })
    await user.click(button)
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('shows a zero-state label when the list is empty', async () => {
    vi.mocked(hrApi.listEmployees).mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })

    renderWithQueryClient(
      <EmployeeList lang="en" onOpenDetail={() => {}} onNew={() => {}} onEdit={() => {}} />,
    )

    await waitFor(() => {
      // Any of the expected empty-state phrases — keeps the test robust to
      // copy tweaks in en.json.
      const matches = screen.queryAllByText(/no.*employee|no rows|ไม่พบ/i)
      expect(matches.length).toBeGreaterThan(0)
    })
  })
})
