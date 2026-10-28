import { expect, test } from '@playwright/test'
import { ACCOUNTS, clearSession, loginAs, WORLD_PASSWORD } from './helpers/auth.js'
import {
  MOBILE_VIEWPORT,
  assertNoHorizontalOverflow,
  mobileSnap,
  resetMobileScreenshots,
  writeMobileScreenshotIndex,
} from './helpers/mobileScreenshots.js'

/**
 * Mobile viewport tour: screenshot every major route and flag horizontal overflow.
 */
test.describe.configure({ mode: 'serial' })

async function checkOverflow(page, label) {
  const result = await assertNoHorizontalOverflow(page)
  const detail = result.offenders?.length
    ? result.offenders.map((o) => `${o.tag}@${o.right}`).join(', ')
    : `scrollWidth=${result.scrollWidth}, inner=${result.innerWidth}`
  expect(result.ok, `${label}: horizontal overflow (${detail})`).toBe(true)
}

test.describe('Mobile responsive screenshots', () => {
  test.setTimeout(360_000)

  test.beforeAll(() => {
    resetMobileScreenshots()
  })

  test.afterAll(() => {
    writeMobileScreenshotIndex()
  })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
  })

  test('M — public pages', async ({ page }) => {
    await clearSession(page)

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
    await mobileSnap(page, 'public-landing', 'Landing (mobile)')
    await checkOverflow(page, 'landing')

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    // Auth card should own the form; mobile header must not look like a floating card over the side copy.
    await expect(page.locator('.auth-card')).toBeVisible()
    await expect(page.locator('.auth .side')).toBeHidden()
    await mobileSnap(page, 'public-login', 'Sign-in (mobile)')
    await checkOverflow(page, 'login')

    await page.goto('/register')
    await expect(page.getByRole('heading', { name: /Create student account/i })).toBeVisible()
    await mobileSnap(page, 'public-register', 'Register (mobile)')
    await checkOverflow(page, 'register')

    await page.goto('/forgot')
    await expect(page.getByRole('heading', { name: /Forgot|Reset/i })).toBeVisible()
    await mobileSnap(page, 'public-forgot', 'Forgot password (mobile)')
    await checkOverflow(page, 'forgot')

    await page.goto('/setup')
    await mobileSnap(page, 'public-setup', 'Setup / institution (mobile)')
    await checkOverflow(page, 'setup')
  })

  test('M — admin pages', async ({ page }) => {
    await loginAs(page, 'admin')
    await mobileSnap(page, 'admin-dashboard', 'Admin home (mobile)')
    await checkOverflow(page, 'admin-dashboard')

    await page.goto('/app/admin/departments')
    await expect(page.getByRole('heading', { name: 'Departments' })).toBeVisible()
    await mobileSnap(page, 'admin-departments', 'Admin departments (mobile)')
    await checkOverflow(page, 'admin-departments')

    await page.goto('/app/admin/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await mobileSnap(page, 'admin-users', 'Admin users (mobile)')
    await checkOverflow(page, 'admin-users')

    await page.goto('/app/admin/users/new')
    await expect(page.getByRole('heading', { name: /Add/i })).toBeVisible()
    await mobileSnap(page, 'admin-add-staff', 'Admin add staff (mobile)')
    await checkOverflow(page, 'admin-add-staff')

    await page.goto('/app/admin/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await mobileSnap(page, 'admin-settings', 'Admin settings (mobile)')
    await checkOverflow(page, 'admin-settings')
  })

  test('M — HOD pages', async ({ page }) => {
    await loginAs(page, 'hod')
    await mobileSnap(page, 'hod-dashboard', 'HOD home (mobile)')
    await checkOverflow(page, 'hod-dashboard')

    await page.goto('/app/hod/requests')
    await expect(page.getByRole('heading', { name: 'Paper requests' })).toBeVisible()
    await mobileSnap(page, 'hod-requests', 'HOD requests (mobile)')
    await checkOverflow(page, 'hod-requests')

    await page.goto('/app/hod/approvals')
    await expect(page.getByRole('heading', { name: 'Paper approvals' })).toBeVisible()
    await mobileSnap(page, 'hod-approvals', 'HOD approvals (mobile)')
    await checkOverflow(page, 'hod-approvals')

    const reviewLink = page.locator('a[href*="/app/hod/approvals/"], button:has-text("Review")').first()
    if (await reviewLink.count()) {
      await reviewLink.click()
      await page.waitForURL(/\/app\/hod\/approvals\//, { timeout: 15_000 }).catch(() => {})
      await mobileSnap(page, 'hod-review', 'HOD review (mobile)')
      await checkOverflow(page, 'hod-review')
    }

    await page.goto('/app/hod/analytics')
    await mobileSnap(page, 'hod-analytics', 'HOD analytics (mobile)')
    await checkOverflow(page, 'hod-analytics')

    await page.goto('/app/hod/policy')
    await expect(page.getByRole('button', { name: 'Save policy' })).toBeVisible()
    await mobileSnap(page, 'hod-policy', 'HOD policy (mobile)')
    await checkOverflow(page, 'hod-policy')
  })

  test('M — teacher pages', async ({ page }) => {
    await loginAs(page, 'teacher')
    await mobileSnap(page, 'teacher-dashboard', 'Teacher home (mobile)')
    await checkOverflow(page, 'teacher-dashboard')

    await page.goto('/app/teacher/classes')
    await expect(page.getByText(/CS-201-A/i).first()).toBeVisible({ timeout: 20_000 })
    await mobileSnap(page, 'teacher-classes', 'Teacher classes (mobile)')
    await checkOverflow(page, 'teacher-classes')

    await page.getByText(/CS-201-A/i).first().click()
    await expect(page).toHaveURL(/\/app\/teacher\/classes\//)
    await mobileSnap(page, 'teacher-class-detail', 'Teacher class detail (mobile)')
    await checkOverflow(page, 'teacher-class-detail')

    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible()
    await mobileSnap(page, 'teacher-materials', 'Teacher materials (mobile)')
    await checkOverflow(page, 'teacher-materials')

    await page.goto('/app/teacher/exams')
    await expect(page.getByRole('heading', { name: /My exams|Exams/i })).toBeVisible()
    await mobileSnap(page, 'teacher-exams', 'Teacher exams (mobile)')
    await checkOverflow(page, 'teacher-exams')

    await page.goto('/app/teacher/exams/new')
    await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add type/i })).toBeVisible()
    await expect(page.locator('#cf-label-2')).toHaveValue(/Long Questions/i)
    await mobileSnap(page, 'teacher-create-exam', 'Teacher create exam — editable types (mobile)')
    await checkOverflow(page, 'teacher-create-exam')

    await page.goto('/app/teacher/exams')
    await expect(page.getByRole('button', { name: 'Paper' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Paper' }).first().click()
    await page.waitForURL(/\/app\/teacher\/exams\/[^/]+/, { timeout: 20_000 })
    await mobileSnap(page, 'teacher-exam-editor', 'Teacher exam editor (mobile)')
    await checkOverflow(page, 'teacher-exam-editor')

    const resultsBtn = page.getByRole('button', { name: 'Results' }).first()
    if (await resultsBtn.count()) {
      await resultsBtn.click()
      const onResults = await page
        .waitForURL(/\/app\/teacher\/.*\/results/, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
      if (onResults) {
        await mobileSnap(page, 'teacher-results', 'Teacher results (mobile)')
        await checkOverflow(page, 'teacher-results')
      }
    }

    // Re-auth if a prior navigation dropped the session (defensive for serial tour).
    if (!page.url().includes('/app/teacher')) {
      await loginAs(page, 'teacher')
    }
    await page.goto('/app/teacher/flags')
    await expect(page.getByRole('heading', { name: /AI-writing flags/i })).toBeVisible({
      timeout: 20_000,
    })
    await mobileSnap(page, 'teacher-flags', 'Teacher flags (mobile)')
    await checkOverflow(page, 'teacher-flags')
  })

  test('M — student pages', async ({ page }) => {
    await loginAs(page, 'student')
    await mobileSnap(page, 'student-dashboard', 'Student home (mobile)')
    await checkOverflow(page, 'student-dashboard')

    await page.goto('/app/student/classes')
    await expect(page.getByText(/CS-201-A/i).first()).toBeVisible({ timeout: 20_000 })
    await mobileSnap(page, 'student-classes', 'Student classes (mobile)')
    await checkOverflow(page, 'student-classes')

    await page.getByText(/CS-201-A/i).first().click()
    await expect(page).toHaveURL(/\/app\/student\/classes\//)
    await mobileSnap(page, 'student-class-detail', 'Student class detail (mobile)')
    await checkOverflow(page, 'student-class-detail')

    await page.goto('/app/student/exams')
    await expect(page.getByRole('heading', { name: /My exams/i })).toBeVisible()
    await mobileSnap(page, 'student-exams', 'Student exams (mobile)')
    await checkOverflow(page, 'student-exams')

    const startBtn = page.getByRole('button', { name: /Start exam/i }).or(
      page.getByRole('link', { name: /Start exam/i }),
    )
    if (await startBtn.first().count()) {
      await startBtn.first().click()
      await expect(page.getByRole('button', { name: /^Start exam$/i })).toBeVisible({
        timeout: 20_000,
      })
      await mobileSnap(page, 'student-take-exam', 'Student take exam gate (mobile)')
      await checkOverflow(page, 'student-take-exam')
      await page.getByRole('button', { name: /^Start exam$/i }).click()
      await expect(page.locator('#timer')).toBeVisible({ timeout: 30_000 })
      await mobileSnap(page, 'student-take-exam-live', 'Student take exam live (mobile)')
      await checkOverflow(page, 'student-take-exam-live')
    }

    await page.goto('/app/student/results')
    await expect(page.getByRole('heading', { name: /Results/i })).toBeVisible()
    await mobileSnap(page, 'student-results', 'Student results (mobile)')
    await checkOverflow(page, 'student-results')

    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible()
    await mobileSnap(page, 'student-study', 'Student study assistant (mobile)')
    await checkOverflow(page, 'student-study')
  })

  test('M — login error + desktop control shot', async ({ page }) => {
    await clearSession(page)
    await page.locator('#l-email').fill(ACCOUNTS.admin.email)
    await page.locator('#l-pw').fill('not-the-password')
    await page.locator('#l-portal').selectOption({ label: 'Admin' })
    await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await mobileSnap(page, 'login-error', 'Sign-in error (mobile)')
    await checkOverflow(page, 'login-error')

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.locator('#l-pw').fill(WORLD_PASSWORD)
    await page.locator('#l-portal').selectOption({ label: 'Admin' })
    await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/app\/admin/, { timeout: 30_000 })
    await mobileSnap(page, 'admin-dashboard-desktop', 'Admin home desktop control (1280)')
  })
})
