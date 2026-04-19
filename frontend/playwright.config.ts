import { defineConfig, devices } from '@playwright/test'

// Single-browser smoke config for the Phase-0 E2E path. Each module in
// Phase 1+ adds its own spec under e2e/<module_id>.spec.ts; they share
// this config.
//
// Assumes the backend API is already reachable at BACKEND_URL (default
// http://localhost:8080). In CI the workflow starts it explicitly; locally
// `make dev` handles it. Playwright itself starts Vite via webServer below.

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
