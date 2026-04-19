import { test, expect } from '@playwright/test'

// Phase-1A hr_employees smoke. The seeder creates baseline companies /
// departments / positions along with the admin, so navigating to the
// employees page should render the empty list with KPI tiles + filter bar
// + "New Employee" button. We don't create an employee here because that
// requires wider coverage of the form; that's a future test.

const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@trimurti.local'
const password = process.env.E2E_ADMIN_PASSWORD

test.describe('hr_employees smoke', () => {
  test.skip(!password, 'Set E2E_ADMIN_PASSWORD to run E2E against a seeded backend')

  test('logged-in admin can open the employees list', async ({ page }) => {
    // Reuse the login flow. Keeping this explicit (rather than a fixture)
    // makes the failure site obvious in the report.
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/password/i).fill(password!)
    await page.getByRole('button', { name: /sign in|เข้าสู่ระบบ/i }).click()
    await page.waitForURL('**/')

    await page.goto('/hr-employees')

    // Page title is translated; accept either locale.
    await expect(
      page.getByRole('heading', { name: /employees|พนักงาน/i }).first(),
    ).toBeVisible()

    // The "New Employee" CTA is always present for someone with write
    // permission (admin has hr_employees.write seeded).
    await expect(page.getByRole('button', { name: /new employee|เพิ่มพนักงาน/i })).toBeVisible()
  })
})
