import { test, expect } from '@playwright/test'

// Phase-0 smoke: log in with the seeded admin and confirm the authenticated
// app shell renders. Credentials come from env so CI can pin them and so
// nothing is hard-coded.
//
// Required env (CI or local):
//   E2E_ADMIN_EMAIL      (default: admin@trimurti.local)
//   E2E_ADMIN_PASSWORD   (no default — the seeder prints this on first run)

const email = process.env.E2E_ADMIN_EMAIL ?? 'admin@trimurti.local'
const password = process.env.E2E_ADMIN_PASSWORD

test.describe('Phase-0 smoke', () => {
  test.skip(!password, 'Set E2E_ADMIN_PASSWORD to run E2E against a seeded backend')

  test('login loads the authenticated app shell', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /trimurti/i })).toBeVisible()

    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/password/i).fill(password!)
    await page.getByRole('button', { name: /sign in|เข้าสู่ระบบ/i }).click()

    await page.waitForURL('**/')
    await expect(page.getByText(`Signed in as`)).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
  })
})
