import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQueryClient } from '@/test/utils'

// Hoisted mocks — auth provides the companies array and `refresh`, API
// module owns the switch call. Tests never hit the network.
const authMock = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  refresh: vi.fn(async () => {}),
}))
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: authMock.user, refresh: authMock.refresh, hasPermission: () => true }),
}))

const apiMock = vi.hoisted(() => ({
  switchCompany: vi.fn(async () => ({})),
}))
vi.mock('@/lib/api/settings', () => ({ settingsApi: apiMock }))

import { CompanySwitcher } from './company-switcher'
import '@/lib/i18n'

describe('CompanySwitcher', () => {
  it('renders nothing when the user has only one company', () => {
    authMock.user = {
      id: 1,
      companies: [{ id: 1, code: 'TMT', name_th: 'TM', name_en: 'TM', is_default: true }],
      active_company_id: 1,
    }
    const { container } = renderWithQueryClient(<CompanySwitcher />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a dropdown with each company when membership is >1', () => {
    authMock.user = {
      id: 1,
      companies: [
        { id: 1, code: 'A', name_th: 'Alpha', name_en: 'Alpha', is_default: true },
        { id: 2, code: 'B', name_th: 'Bravo', name_en: 'Bravo', is_default: false },
      ],
      active_company_id: 1,
    }
    renderWithQueryClient(<CompanySwitcher />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /alpha/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /bravo/i })).toBeInTheDocument()
  })

  it('calls switchCompany and refresh when a new company is picked', async () => {
    apiMock.switchCompany.mockClear()
    authMock.refresh.mockClear()
    authMock.user = {
      id: 1,
      companies: [
        { id: 1, code: 'A', name_th: 'Alpha', name_en: 'Alpha', is_default: true },
        { id: 2, code: 'B', name_th: 'Bravo', name_en: 'Bravo', is_default: false },
      ],
      active_company_id: 1,
    }
    renderWithQueryClient(<CompanySwitcher />)
    await userEvent.selectOptions(screen.getByRole('combobox'), '2')
    await waitFor(() => expect(apiMock.switchCompany).toHaveBeenCalledWith(2))
    expect(authMock.refresh).toHaveBeenCalledTimes(1)
  })
})
