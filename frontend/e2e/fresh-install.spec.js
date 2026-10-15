import { expect, test } from '@playwright/test'
import { clearSession } from './helpers/auth.js'

/**
 * Empty-DB first-run: /setup → admin home → setup locked.
 * Uses playwright.fresh.config.js (MONGO_DB=cogni_fresh, no world seed).
 */
test.describe('Fresh install', () => {
  test.setTimeout(120_000)

  test('empty DB shows setup; creating admin unlocks the app', async ({ page, request }) => {
    const cfg0 = await request.get('http://127.0.0.1:8000/api/public/config')
    expect(cfg0.ok()).toBeTruthy()
    expect((await cfg0.json()).needs_setup).toBe(true)

    await clearSession(page)
    await page.goto('/register')
    await expect(page).toHaveURL(/\/setup/)

    await page.goto('/setup')
    await expect(page.getByRole('heading', { name: /Create your institution/i })).toBeVisible()

    const tag = Date.now().toString(36)
    await page.locator('#su-name').fill('Fresh Admin')
    await page.locator('#su-email').fill(`fresh.admin.${tag}@school.edu`)
    await page.locator('#su-pw').fill('Strong-Passw0rd!')
    await page.locator('#su-inst').fill('Fresh University')
    await page.locator('#su-term').fill('Spring 2027')
    await page.getByRole('button', { name: /Create admin account/i }).click()

    await page.waitForURL(/\/app\/admin/, { timeout: 45_000 })
    await expect(page.getByText(/ADMIN CONSOLE|ADMIN PORTAL/i).first()).toBeVisible()

    const cfg1 = await request.get('http://127.0.0.1:8000/api/public/config')
    expect((await cfg1.json()).needs_setup).toBe(false)

    await page.goto('/setup')
    await expect(page).not.toHaveURL(/\/setup/)

    const again = await request.post('http://127.0.0.1:8000/api/setup/admin', {
      data: {
        name: 'Second',
        email: `second.${tag}@school.edu`,
        password: 'Strong-Passw0rd!',
        institution_name: 'X',
        current_term: 'Y',
      },
    })
    expect(again.status()).toBe(409)
  })
})
