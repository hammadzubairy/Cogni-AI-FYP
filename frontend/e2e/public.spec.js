import { expect, test } from '@playwright/test'
import { ACCOUNTS, loginAs, loginWithPassword, WORLD_PASSWORD } from './helpers/auth.js'

test.describe('Public pages', () => {
  test('landing page loads and links to sign in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /cogni\.ai/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Create account/i }).first()).toBeVisible()
  })

  test('login page shows create-account link', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Create (student )?account/i })).toBeVisible()
  })

  test('register page is student-only', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: /Create student account/i })).toBeVisible()
    await expect(page.locator('#r-role')).toHaveCount(0)
    await expect(page.locator('#r-dept')).toHaveCount(0)
    await expect(page.locator('#r-name')).toBeVisible()
    await expect(page.locator('#r-email')).toBeVisible()
  })

  test('teacher sign-in lands on teacher home', async ({ page }) => {
    await loginAs(page, 'teacher')
    await expect(page).toHaveURL(/\/app\/teacher\/?$/)
    await expect(page.getByText(/TEACHER PORTAL/i).first()).toBeVisible()
  })

  test('wrong password shows an error', async ({ page }) => {
    await loginWithPassword(page, ACCOUNTS.admin.email, 'not-the-password')
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('manual login with world password works', async ({ page }) => {
    await loginWithPassword(page, ACCOUNTS.student.email, WORLD_PASSWORD)
    await page.waitForURL(/\/app\/student/, { timeout: 30_000 })
    await expect(page.getByText(/STUDENT PORTAL/i).first()).toBeVisible()
  })
})
