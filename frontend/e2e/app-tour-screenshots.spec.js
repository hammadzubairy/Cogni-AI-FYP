import { expect, test } from '@playwright/test'
import { ACCOUNTS, clearSession, loginAs, WORLD_PASSWORD } from './helpers/auth.js'
import {
  resetScreenshots,
  snap,
  writeScreenshotIndex,
} from './helpers/screenshots.js'

/**
 * Full-app visual walkthrough with numbered screenshots (SS01…).
 * Serial so one browser session walks every role in order.
 */
test.describe.configure({ mode: 'serial' })

test.describe('App tour with screenshots', () => {
  test.setTimeout(300_000)

  test.beforeAll(() => {
    resetScreenshots()
  })

  test.afterAll(() => {
    writeScreenshotIndex()
  })

  test('SS — public: landing, login, register, forgot', async ({ page }) => {
    await clearSession(page)

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
    await snap(page, 'public-landing', 'Landing page')

    await page.getByRole('button', { name: 'Sign in' }).first().click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await snap(page, 'public-login', 'Sign-in page')

    await page.getByRole('link', { name: /Create (student )?account/i }).click()
    await expect(page.getByRole('heading', { name: /Create student account/i })).toBeVisible()
    await snap(page, 'public-register-student', 'Register — student self-signup')

    await page.goto('/forgot')
    await expect(page.getByRole('heading', { name: /Forgot|Reset/i })).toBeVisible()
    await snap(page, 'public-forgot', 'Forgot password')
  })

  test('SS — signup student then check-email gate', async ({ page }) => {
    const tag = Date.now().toString(36)
    await clearSession(page)
    await page.goto('/register')
    await page.locator('#r-name').fill(`E2E Student ${tag}`)
    await page.locator('#r-email').fill(`e2e.student.${tag}@school.edu`)
    await page.locator('#r-pw').fill('Strong-Passw0rd!')
    await snap(page, 'signup-student-filled', 'Register form filled for new student')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: /Check your email/i })).toBeVisible({
      timeout: 30_000,
    })
    await snap(page, 'signup-student-verify', 'New student must verify email before sign-in')
  })

  test('SS — admin add staff (staff not public signup)', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/app/admin/users/new')
    await expect(page.getByRole('heading', { name: /Add/i })).toBeVisible()
    await snap(page, 'signup-staff-via-admin', 'Staff accounts are created by admin Add Staff')
  })

  test('SS — admin portal pages', async ({ page }) => {
    await loginAs(page, 'admin')
    await snap(page, 'admin-dashboard', 'Admin home / dashboard')

    await page.goto('/app/admin/departments')
    await expect(page.getByRole('heading', { name: 'Departments' })).toBeVisible()
    await snap(page, 'admin-departments', 'Admin departments')

    await page.getByRole('navigation', { name: 'Section' }).getByRole('button', { name: 'Classes' }).click()
    await expect(page).toHaveURL(/tab=classes/)
    await snap(page, 'admin-classes', 'Admin departments → Classes tab')

    await page.goto('/app/admin/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await snap(page, 'admin-users', 'Admin users')

    await page.goto('/app/admin/users/new')
    await expect(page.getByRole('heading', { name: /Add/i })).toBeVisible()
    await snap(page, 'admin-add-staff', 'Admin add staff')

    await page.goto('/app/admin/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await snap(page, 'admin-settings', 'Admin settings (self-signup toggle)')

    await page.getByRole('navigation', { name: 'Section' }).getByRole('button', { name: 'Activity log' }).click()
    await expect(page).toHaveURL(/tab=activity/)
    await snap(page, 'admin-activity', 'Admin activity log')
  })

  test('SS — HOD portal pages', async ({ page }) => {
    await loginAs(page, 'hod')
    await snap(page, 'hod-dashboard', 'HOD home / dashboard')

    await page.goto('/app/hod/requests')
    await expect(page.getByRole('heading', { name: 'Paper requests' })).toBeVisible()
    await snap(page, 'hod-requests', 'HOD paper requests')

    await page.goto('/app/hod/approvals')
    await expect(page.getByRole('heading', { name: 'Paper approvals' })).toBeVisible()
    await snap(page, 'hod-approvals', 'HOD paper approvals')

    const reviewLink = page.locator('a[href*="/app/hod/approvals/"], button:has-text("Review")').first()
    if (await reviewLink.count()) {
      await reviewLink.click()
      await page.waitForURL(/\/app\/hod\/approvals\//, { timeout: 15_000 }).catch(() => {})
      await snap(page, 'hod-review', 'HOD review paper (if pending)')
    }

    await page.goto('/app/hod/analytics')
    await snap(page, 'hod-analytics', 'HOD department analytics')

    await page.goto('/app/hod/policy')
    await expect(page.getByRole('button', { name: 'Save policy' })).toBeVisible()
    await snap(page, 'hod-policy', 'HOD department policy')
  })

  test('SS — teacher portal pages', async ({ page }) => {
    await loginAs(page, 'teacher')
    await snap(page, 'teacher-dashboard', 'Teacher home / dashboard')

    await page.goto('/app/teacher/classes')
    await expect(page.getByText(/CS-201-A/i).first()).toBeVisible({ timeout: 20_000 })
    await snap(page, 'teacher-classes', 'Teacher classes list')

    await page.getByText(/CS-201-A/i).first().click()
    await expect(page).toHaveURL(/\/app\/teacher\/classes\//)
    await snap(page, 'teacher-class-detail', 'Teacher class detail (CS-201-A)')

    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible()
    await snap(page, 'teacher-materials', 'Teacher course material')

    await page.goto('/app/teacher/exams')
    await expect(page.getByRole('heading', { name: /My exams|Exams/i })).toBeVisible()
    await snap(page, 'teacher-exams', 'Teacher my exams')

    await page.goto('/app/teacher/exams/new')
    await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible()
    await snap(page, 'teacher-create-exam', 'Teacher generate draft paper')

    await page.goto('/app/teacher/exams')
    await expect(page.getByRole('button', { name: 'Paper' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Paper' }).first().click()
    await page.waitForURL(/\/app\/teacher\/exams\/[^/]+/, { timeout: 20_000 })
    await expect(page.getByRole('heading').first()).toBeVisible()
    await snap(page, 'teacher-exam-editor', 'Teacher exam / paper editor')

    await page.goto('/app/teacher/exams')
    await expect(page.getByRole('button', { name: 'Results' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Results' }).first().click()
    await page.waitForURL(/\/results/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: /Results/i }).first()).toBeVisible()
    await snap(page, 'teacher-results', 'Teacher exam results')

    await page.goto('/app/teacher/flags')
    await expect(page.getByRole('heading', { name: /AI-writing flags/i })).toBeVisible()
    await snap(page, 'teacher-flags', 'Teacher AI-writing flags')
  })

  test('SS — student portal pages', async ({ page }) => {
    await loginAs(page, 'student')
    await snap(page, 'student-dashboard', 'Student home / dashboard')

    await page.goto('/app/student/classes')
    await expect(page.getByText(/CS-201-A/i).first()).toBeVisible({ timeout: 20_000 })
    await snap(page, 'student-classes', 'Student classes')

    await page.getByText(/CS-201-A/i).first().click()
    await expect(page).toHaveURL(/\/app\/student\/classes\//)
    await snap(page, 'student-class-detail', 'Student class detail')

    await page.goto('/app/student/exams')
    await expect(page.getByRole('heading', { name: /My exams/i })).toBeVisible()
    await snap(page, 'student-exams', 'Student my exams')

    const startBtn = page.getByRole('button', { name: /Start exam/i }).or(
      page.getByRole('link', { name: /Start exam/i }),
    )
    await expect(startBtn.first()).toBeVisible({ timeout: 20_000 })
    await startBtn.first().click()
    await expect(page.getByRole('button', { name: /^Start exam$/i })).toBeVisible({
      timeout: 20_000,
    })
    await snap(page, 'student-take-exam', 'Student take exam — before you start gate')
    await page.getByRole('button', { name: /^Start exam$/i }).click()
    await expect(page.locator('#timer')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('aside[aria-label="Question navigator"]')).toBeVisible({
      timeout: 15_000,
    })
    await snap(page, 'student-take-exam-live', 'Student take exam — live timer and navigator')

    await page.goto('/app/student/results')
    await expect(page.getByRole('heading', { name: /Results/i })).toBeVisible()
    await snap(page, 'student-results', 'Student results list')

    const feedback = page.getByRole('link', { name: /feedback|View/i }).or(
      page.getByRole('button', { name: /feedback|View/i }),
    )
    if ((await feedback.count()) > 0) {
      await feedback.first().click()
      await page.waitForTimeout(800)
      await snap(page, 'student-feedback', 'Student feedback detail')
    }

    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible()
    await snap(page, 'student-study', 'Student study assistant')
  })

  test('SS — wrong password error state', async ({ page }) => {
    await clearSession(page)
    await page.locator('#l-email').fill(ACCOUNTS.admin.email)
    await page.locator('#l-pw').fill('not-the-password')
    await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await snap(page, 'login-error', 'Sign-in error (wrong password)')
    // sanity: real password still works
    await page.locator('#l-pw').fill(WORLD_PASSWORD)
    await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/app\/admin/, { timeout: 30_000 })
  })
})
