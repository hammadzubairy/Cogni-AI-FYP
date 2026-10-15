import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth.js'

test.describe('Teacher portal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'teacher')
  })

  test('home dashboard loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/app\/teacher\/?$/)
    await expect(page.getByText(/TEACHER PORTAL/i).first()).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i }),
    ).toBeVisible()
  })

  test('classes list and class detail', async ({ page }) => {
    await page.goto('/app/teacher/classes')
    await expect(page.getByText(/CS-201-A/i).first()).toBeVisible({ timeout: 20_000 })

    await page.getByText(/CS-201-A/i).first().click()
    await expect(page).toHaveURL(/\/app\/teacher\/classes\//)
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
  })

  test('materials page', async ({ page }) => {
    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible({
      timeout: 20_000,
    })
  })

  test('my exams list', async ({ page }) => {
    await page.goto('/app/teacher/exams')
    await expect(page.getByRole('heading', { name: /My exams|Exams/i })).toBeVisible({
      timeout: 20_000,
    })
  })

  test('create exam page', async ({ page }) => {
    await page.goto('/app/teacher/exams/new')
    await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: /Generate draft paper/i })).toBeVisible()
  })

  test('flags review page', async ({ page }) => {
    await page.goto('/app/teacher/flags')
    await expect(page.getByRole('heading', { name: /AI-writing flags/i })).toBeVisible()
  })
})
