/**
 * Multi-role portal selector proof (R1–R10).
 * Screenshots → errors/verified/multi-role/
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ACCOUNTS,
  WORLD_PASSWORD,
  clearSession,
  loginAs,
  loginWithPassword,
} from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = path.resolve(__dirname, '../../errors/verified/multi-role')

async function shot(page, name) {
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: true,
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('multi-role login', () => {
  test('R10 login page shows Portal selector', async ({ page }) => {
    await clearSession(page)
    await expect(page.locator('#l-portal')).toBeVisible()
    await expect(page.locator('label[for="l-portal"]')).toHaveText(/Portal/i)
    await shot(page, 'R10-portal-selector')
  })

  test('R1 student signs in as Student', async ({ page }) => {
    await loginAs(page, 'student')
    await expect(page).toHaveURL(/\/app\/student/)
    await shot(page, 'R1-student-as-student')
  })

  test('R2 student signs in as Admin → error', async ({ page }) => {
    await loginWithPassword(
      page,
      ACCOUNTS.student.email,
      WORLD_PASSWORD,
      'admin',
    )
    await expect(page.locator('.err')).toBeVisible()
    await expect(page.locator('.err')).toContainText(/portal/i)
    await expect(page).toHaveURL(/\/login/)
    await shot(page, 'R2-student-as-admin-denied')
  })

  test('R3 student signs in as HOD → error', async ({ page }) => {
    await loginAs(page, 'student', {
      portal: 'hod',
      expectError: true,
      expectHome: null,
    })
    await expect(page.locator('.err')).toContainText(/portal/i)
    await shot(page, 'R3-student-as-hod-denied')
  })

  test('R4 teacher-only as Teacher', async ({ page }) => {
    await loginAs(page, 'teacher')
    await expect(page).toHaveURL(/\/app\/teacher/)
    await shot(page, 'R4-teacher-as-teacher')
  })

  test('R5 teacher-only as HOD → error', async ({ page }) => {
    await loginAs(page, 'teacher', {
      portal: 'hod',
      expectError: true,
      expectHome: null,
    })
    await expect(page.locator('.err')).toContainText(/portal/i)
    await shot(page, 'R5-teacher-as-hod-denied')
  })

  test('R6 HOD+Teacher (Tariq) as HOD', async ({ page }) => {
    await loginAs(page, 'hod')
    await expect(page).toHaveURL(/\/app\/hod/)
    await shot(page, 'R6-tariq-as-hod')
  })

  test('R7 same account as Teacher', async ({ page }) => {
    await loginAs(page, 'hodTeacher')
    await expect(page).toHaveURL(/\/app\/teacher/)
    await shot(page, 'R7-tariq-as-teacher')
  })

  test('R8 teacher+student dual both homes', async ({ page }) => {
    await loginAs(page, 'teacherStudent')
    await expect(page).toHaveURL(/\/app\/student/)
    await shot(page, 'R8a-faisal-as-student')

    await loginAs(page, 'teacherStudentAsTeacher')
    await expect(page).toHaveURL(/\/app\/teacher/)
    await shot(page, 'R8b-faisal-as-teacher')
  })

  test('R9 switch portal HOD ↔ Teacher without re-password', async ({ page }) => {
    await loginAs(page, 'hod')
    await expect(page).toHaveURL(/\/app\/hod/)

    await page.getByRole('button', { name: /Account menu/i }).click()
    await expect(page.getByText('Switch portal')).toBeVisible()
    await shot(page, 'R9a-switch-menu')

    await page.getByRole('button', { name: /^Teacher$/ }).click()
    await page.waitForURL((url) => url.pathname.startsWith('/app/teacher'), {
      timeout: 20_000,
    })
    await shot(page, 'R9b-switched-to-teacher')

    await page.getByRole('button', { name: /Account menu/i }).click()
    await page.getByRole('button', { name: /Head of Department/i }).click()
    await page.waitForURL((url) => url.pathname.startsWith('/app/hod'), {
      timeout: 20_000,
    })
    await shot(page, 'R9c-switched-back-to-hod')
  })
})
