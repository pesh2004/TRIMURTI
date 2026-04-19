import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { renderWithQueryClient } from '@/test/utils'

// Mock the API module before importing the component — vi.mock is hoisted
// above the component import by Vitest.
vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    body: unknown
    constructor(status: number, msg: string, body: unknown) {
      super(msg)
      this.status = status
      this.body = body
    }
  },
}))

// Shallow-mock the router so we can render the page without spinning up a
// real RouterProvider. Only <Link> is used in this page, and useNavigate
// isn't wired up here. The Link becomes a plain anchor; click handlers
// still fire.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}))

import { ForgotPasswordPage } from './forgot-password'
import { api } from '@/lib/api'

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
  })

  it('renders the form and submits a POST to the reset endpoint', async () => {
    vi.mocked(api).mockResolvedValue({ status: 'ok' })
    const user = userEvent.setup()

    renderWithQueryClient(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email/i), 'admin@trimurti.local')
    await user.click(screen.getByRole('button', { name: /send reset link|ส่งลิงก์/i }))

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/api/v1/auth/password-reset/request',
        expect.objectContaining({
          method: 'POST',
          body: { email: 'admin@trimurti.local' },
        }),
      )
    })
  })

  it('shows the "email sent" confirmation after a successful submit', async () => {
    vi.mocked(api).mockResolvedValue({ status: 'ok' })
    const user = userEvent.setup()

    renderWithQueryClient(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email/i), 'admin@trimurti.local')
    await user.click(screen.getByRole('button', { name: /send reset link|ส่งลิงก์/i }))

    // The backend deliberately returns 200 whether or not the email
    // exists. The UI should show a neutral "if it exists, a link is on
    // the way" message — we assert that phrase in either locale lands.
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
    expect(screen.getByRole('status').textContent).toMatch(/link|ลิงก์/i)
  })
})
