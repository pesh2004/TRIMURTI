import { test, expect } from '@playwright/test'

// Phase-1A hr_employees smoke. The seeder creates baseline companies /
// departments / positions along with the admin, so navigating to the
// employees page should render the empty list with KPI tiles + filter bar
// + "New Employee" button. We don't create an employee here because that
// requires wider coverage of the form; that's a future test.

const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@trimurti.local'
const password = process.env.E2E_ADMIN_PASSWORD

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password!)
  await page.getByRole('button', { name: /sign in|เข้าสู่ระบบ/i }).click()
  await page.waitForURL('**/')
}

test.describe('hr_employees smoke', () => {
  test.skip(!password, 'Set E2E_ADMIN_PASSWORD to run E2E against a seeded backend')

  test('logged-in admin can open the employees list', async ({ page }) => {
    await login(page)
    await page.goto('/hr-employees')

    // Page heading is <h1>{t('hr.list')}</h1> → "Employee List" / "รายชื่อพนักงาน".
    // Loosen the pattern so either locale matches; the `.first()` guards
    // against the sidebar nav item also being considered a heading on a
    // future iteration.
    await expect(
      page.getByRole('heading', { name: /employee|พนักงาน/i }).first(),
    ).toBeVisible()

    // The "New Employee" CTA is always present for someone with write
    // permission (admin has hr_employees.write seeded).
    await expect(page.getByRole('button', { name: /new employee|เพิ่มพนักงาน/i })).toBeVisible()
  })

  test('admin can create an employee and see it in the list', async ({ page }) => {
    // Use a timestamp suffix so re-runs don't collide on unique indexes.
    const suffix = Date.now().toString().slice(-6)
    const firstTh = `ทดสอบ${suffix}`
    const lastTh = `อัตโนมัติ`

    await login(page)
    await page.goto('/hr-employees')

    await page.getByRole('button', { name: /new employee|เพิ่มพนักงาน/i }).click()
    await expect(page.getByRole('heading', { name: /new employee|เพิ่มพนักงาน/i })).toBeVisible()

    // Fill the Thai-name inputs. They're the first two textbox inputs in
    // the Personal section — find by the label text the user actually sees.
    const firstThInput = page.locator('.field', { hasText: /First name \(Thai\)|ชื่อ \(ไทย\)/i }).getByRole('textbox')
    const lastThInput = page.locator('.field', { hasText: /Last name \(Thai\)|นามสกุล \(ไทย\)/i }).getByRole('textbox')
    await firstThInput.fill(firstTh)
    await lastThInput.fill(lastTh)

    // Birthdate — native type=date input accepts YYYY-MM-DD via fill().
    await page.locator('.field', { hasText: /Birthdate|วันเกิด/i }).locator('input[type=date]').fill('1990-05-15')

    // Hired-at defaults to today in the form, so nothing to do for that.
    // Submit — the form's Save button is a button with the text Save (or
    // Save & Close).
    await page.getByRole('button', { name: /^save|^บันทึก/i }).last().click()

    // On success the form closes and the list is shown again. The newly
    // created row should appear. We search for the Thai first name.
    await expect(page.getByText(firstTh).first()).toBeVisible({ timeout: 10000 })
  })
})
