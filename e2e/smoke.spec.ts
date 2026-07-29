import { expect, test } from '@playwright/test'

/**
 * Proves the minted session is accepted by both enforcement layers.
 *
 * `middleware.ts` bounces an unauthenticated request for a staff page to `/`,
 * so arriving at the destination is half the assertion. The other half is that
 * the page actually rendered: a URL-only check still passes while the app shows
 * its "Application error" boundary, which is exactly the failure a smoke test
 * exists to catch.
 */
async function expectRendered(page: import('@playwright/test').Page, urlPattern: RegExp) {
  await expect(page).toHaveURL(urlPattern)
  // The nav shell only renders for a signed-in user.
  await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible()
  await expect(page.getByText('Application error')).toHaveCount(0)
}

test.describe('minted session', () => {
  test('reaches a staff page instead of being redirected to the landing page', async ({ page }) => {
    await page.goto('/schedules')
    await expectRendered(page, /\/schedules$/)
  })

  test('is a signed-in session as far as the API is concerned', async ({ page }) => {
    const response = await page.request.get('/api/auth/session')
    expect(response.ok()).toBe(true)

    const session = (await response.json()) as { user?: { name?: string; role?: string } }
    // The role survived the `jwt` callback: without `provider: 'azure-ad'` on
    // the token it would have been stripped to `user`.
    expect(session.user?.role).not.toBe('user')
    expect(session.user?.name).toBeTruthy()
  })

  test('reaches an admin-only page', async ({ page }) => {
    await page.goto('/admin/data')
    await expectRendered(page, /\/admin\/data$/)
    // Admin-only section of the data browser; absent for a plain staff session.
    await expect(page.getByText('Lehrkräfte', { exact: true }).first()).toBeVisible()
  })
})
