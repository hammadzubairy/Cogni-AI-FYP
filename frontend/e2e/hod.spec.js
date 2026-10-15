import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth.js'

test.describe('HOD portal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'hod')
  })

  test('home dashboard loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/app\/hod\/?$/)
    await expect(page.getByText(/HOD PORTAL/i).first()).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i }),
    ).toBeVisible()
  })

  test('paper requests form', async ({ page }) => {
    await page.goto('/app/hod/requests')
    await expect(page.getByRole('heading', { name: 'Paper requests' })).toBeVisible()
    await expect(page.getByLabel('Teacher')).toBeVisible()
    await expect(page.getByLabel('Class')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible()
  })

  test('approvals table', async ({ page }) => {
    await page.goto('/app/hod/approvals')
    await expect(page.getByRole('heading', { name: 'Paper approvals' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Paper' })).toBeVisible()
  })

  test('analytics and policy', async ({ page }) => {
    await page.goto('/app/hod/analytics')
    await expect(page.getByRole('button', { name: 'Analytics' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Policy' })).toBeVisible()

    await page.getByRole('navigation', { name: 'Section' }).getByRole('button', { name: 'Policy' }).click()
    await expect(page).toHaveURL(/\/app\/hod\/policy/)
    await expect(page.getByRole('button', { name: 'Save policy' })).toBeVisible()
  })
})
