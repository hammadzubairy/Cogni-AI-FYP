import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth.js'

test.describe('Student portal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'student')
  })

  test('home dashboard loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/app\/student\/?$/)
    await expect(page.getByText(/STUDENT PORTAL/i).first()).toBeVisible()
  })

  test('classes page', async ({ page }) => {
    await page.goto('/app/student/classes')
    await expect(page.getByText(/CS-201-A/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test('my exams page', async ({ page }) => {
    await page.goto('/app/student/exams')
    await expect(page.getByRole('heading', { name: /My exams/i })).toBeVisible({
      timeout: 20_000,
    })
  })

  test('results page', async ({ page }) => {
    await page.goto('/app/student/results')
    await expect(page.getByRole('heading', { name: /Results/i })).toBeVisible({
      timeout: 20_000,
    })
  })

  test('study assistant loads', async ({ page }) => {
    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible({
      timeout: 20_000,
    })
  })
})
