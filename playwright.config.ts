import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL?.trim() ?? 'http://localhost:3000'

/**
 * Browser-driven checks against a local dev server.
 *
 * Sign-in is not scripted. Entra's OAuth redirect cannot be automated, so
 * `global-setup` mints the session cookie directly (see `e2e/session.ts`) and
 * every spec inherits it through `storageState`. There is no login spec to
 * write and no Entra credentials to hold.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    storageState: 'e2e/.auth/storageState.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Reuses an already-running `npm run dev` rather than fighting it for the
  // port, so an editing session and a test run can share one server.
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
