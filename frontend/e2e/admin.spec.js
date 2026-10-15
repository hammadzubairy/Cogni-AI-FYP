import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth.js'

test.describe('Admin portal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('home dashboard loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/app\/admin\/?$/)
    await expect(page.getByText(/ADMIN CONSOLE/i).first()).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Needs you|At a glance/i }).first(),
    ).toBeVisible()
  })

  test('users page: tabs, search, actions', async ({ page }) => {
    await page.goto('/app/admin/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add user/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Teachers and heads/i })).toBeVisible()
    await page.getByRole('button', { name: /Students/i }).click()
    await page.locator('#uq').fill('hamza')
    await expect(page.getByText(/hamza\.ali@umt\.edu\.pk/i).first()).toBeVisible()
  })

  test('departments and classes tabs', async ({ page }) => {
    await page.goto('/app/admin/departments')
    await expect(page.getByRole('heading', { name: 'Departments' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add department/i })).toBeVisible()
    await expect(page.getByText(/Computer Science/i).first()).toBeVisible()

    await page.getByRole('navigation', { name: 'Section' }).getByRole('button', { name: 'Classes' }).click()
    await expect(page).toHaveURL(/tab=classes/)
    await expect(page.getByRole('columnheader', { name: 'Class' })).toBeVisible()
    await expect(page.getByText(/CS-201-A/i).first()).toBeVisible()
  })

  test('settings save and activity log', async ({ page }) => {
    await page.goto('/app/admin/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByLabel(/HOD approval required for/i)).toBeVisible()
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText(/Settings saved/i)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('navigation', { name: 'Section' }).getByRole('button', { name: 'Activity log' }).click()
    await expect(page).toHaveURL(/tab=activity/)
    await expect(page.getByRole('columnheader', { name: 'What happened' })).toBeVisible()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  })
})
