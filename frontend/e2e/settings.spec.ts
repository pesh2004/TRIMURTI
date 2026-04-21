import { test, expect } from '@playwright/test'

// Phase-1B settings smoke. Exercises the Company tab round-trip against
// the seeded backend: change a harmless field (website), save, reload,
// confirm persistence. We intentionally keep it to a single throwaway
// mutation so re-running the suite doesn't drift the seeded company's
// real fields.

const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@trimurti.local'
const password = process.env.E2E_ADMIN_PASSWORD

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password!)
  await page.getByRole('button', { name: /sign in|เข้าสู่ระบบ/i }).click()
  await page.waitForURL('**/')
}

test.describe('settings smoke', () => {
  test.skip(!password, 'Set E2E_ADMIN_PASSWORD to run E2E against a seeded backend')

  test('admin can open Settings, edit company website, save, and reload', async ({ page }) => {
    const suffix = Date.now().toString().slice(-6)
    const newWebsite = `https://trimurti.example/${suffix}`

    await login(page)
    await page.goto('/settings')

    // Heading
    await expect(page.getByRole('heading', { name: /settings|ตั้งค่า/i })).toBeVisible()

    // Company tab is the default; locate the website input by its label.
    const websiteInput = page.locator('#website')
    await websiteInput.fill(newWebsite)

    // Save
    await page.getByRole('button', { name: /save changes|บันทึก/i }).click()

    // Toast confirms save. Tolerant of either locale.
    await expect(page.getByText(/company profile saved|บันทึกข้อมูลบริษัทแล้ว/i)).toBeVisible({
      timeout: 8000,
    })

    // Hard reload and verify persistence.
    await page.reload()
    await expect(page.locator('#website')).toHaveValue(newWebsite)
  })

  test('integrations tab shows SMTP + storage rows', async ({ page }) => {
    await login(page)
    await page.goto('/settings')

    await page.getByRole('tab', { name: /integrations|การเชื่อมต่อ/i }).click()

    await expect(page.getByText(/email \(smtp\)|อีเมล \(smtp\)/i)).toBeVisible()
    await expect(page.getByText(/file storage|ที่เก็บไฟล์/i)).toBeVisible()
  })
})
