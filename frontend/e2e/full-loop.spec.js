import { expect, test } from '@playwright/test'
import { confirmModal, loginAs } from './helpers/auth.js'

/**
 * README demo script end-to-end (HOD → Teacher → HOD → Teacher → Student →
 * Teacher → Student → Admin). Serial so steps share state on one page.
 */
test.describe.configure({ mode: 'serial' })

test.describe('Full demo loop', () => {
  test.setTimeout(180_000)

  const tag = `PW-${Date.now().toString(36)}`
  const examTitle = `E2E Midterm ${tag}`
  let examId = ''

  test('1. HOD requests a Midterm from the CS teacher', async ({ page }) => {
    await loginAs(page, 'hod')
    await page.goto('/app/hod/requests')
    await expect(page.getByRole('heading', { name: 'Paper requests' })).toBeVisible()

    // Prefer Ayesha if listed
    const teacherSelect = page.locator('#rq-t')
    const teacherOpts = await teacherSelect.locator('option').allTextContents()
    const ayesha = teacherOpts.findIndex((t) => /Ayesha/i.test(t))
    if (ayesha >= 0) {
      await teacherSelect.selectOption({ index: ayesha })
    }

    const classSelect = page.locator('#rq-c')
    const classOpts = await classSelect.locator('option').allTextContents()
    const csIdx = classOpts.findIndex((t) => /CS-201-A/i.test(t))
    expect(csIdx).toBeGreaterThanOrEqual(0)
    await classSelect.selectOption({ index: csIdx })
    await page.locator('#rq-k').selectOption('Midterm')
    // due date already defaulted
    await page.locator('#rq-n').fill(`Playwright E2E request ${tag}`)
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText(/Request sent|sent to/i)).toBeVisible({ timeout: 20_000 })
  })

  test('2. Teacher generates draft and sends to HOD', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/exams/new')
    await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible({
      timeout: 20_000,
    })

    {
      const cls = page.locator('#cf-cls')
      const opts = await cls.locator('option').allTextContents()
      const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
      expect(idx).toBeGreaterThanOrEqual(0)
      await cls.selectOption({ index: idx })
    }
    // Materials are checkboxes under "Source material" (Field id is label-only)
    const matBoxes = page.getByRole('checkbox')
    await expect(matBoxes.first()).toBeVisible({ timeout: 20_000 })
    const count = await matBoxes.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      if (!(await matBoxes.nth(i).isChecked())) {
        await matBoxes.nth(i).check()
      }
    }

    await page.locator('#cf-title').fill(examTitle)
    await page.locator('#cf-kind').selectOption('Midterm')
    // Link open HOD request if offered
    const reqSelect = page.locator('#cf-req')
    if (await reqSelect.count()) {
      const reqOpts = await reqSelect.locator('option').allTextContents()
      const hit = reqOpts.findIndex((t) => /Midterm/i.test(t) && !/None/i.test(t))
      if (hit >= 0) await reqSelect.selectOption({ index: hit })
    }

    // Keep generation small for speed
    await page.locator('#cf-mcq').fill('2')
    await page.locator('#cf-short').fill('1')
    await page.locator('#cf-essay').fill('0')

    await Promise.all([
      page.waitForURL(
        (url) => {
          const m = url.pathname.match(/\/app\/teacher\/exams\/([^/]+)\/?$/)
          return !!(m && m[1] && m[1] !== 'new')
        },
        { timeout: 90_000 },
      ),
      page.getByRole('button', { name: 'Generate draft paper' }).click(),
    ])
    examId = page.url().match(/\/exams\/([^/?#]+)/)?.[1] || ''
    expect(examId).toBeTruthy()
    expect(examId).not.toBe('new')

    await expect(page.getByText(examTitle).first()).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Send to HOD for approval' }).click()
    await expect(page.getByText(/Sent to|Approved|Pending|notified/i).first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test('3. HOD approves the paper', async ({ page }) => {
    await loginAs(page, 'hod')
    await page.goto('/app/hod/approvals')
    await expect(page.getByRole('heading', { name: 'Paper approvals' })).toBeVisible()

    const row = page.locator('tr').filter({ hasText: examTitle })
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.getByRole('button', { name: /Review/i }).click()
    await expect(page).toHaveURL(/\/app\/hod\/approvals\//)

    await page.getByRole('button', { name: /Approve paper/i }).click()
    await confirmModal(page, 'Approve paper')
    await expect(page.getByText(/Approved/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test('4. Teacher publishes to students', async ({ page }) => {
    await loginAs(page, 'teacher')
    expect(examId).toBeTruthy()
    await page.goto(`/app/teacher/exams/${examId}`)
    await expect(page.getByText(examTitle).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: /Publish to students/i })).toBeVisible({
      timeout: 20_000,
    })

    await page.getByRole('button', { name: /Publish to students/i }).click()
    await confirmModal(page, 'Publish to students')
    await expect(page.getByText(/Published/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test('5. Student takes and submits the exam', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/exams')
    await expect(page.getByRole('heading', { name: /My exams/i })).toBeVisible()

    const row = page.locator('.lrow, tr').filter({ hasText: examTitle })
    await expect(row.first()).toBeVisible({ timeout: 20_000 })
    await row.first().getByRole('button', { name: /Start exam/i }).click()

    await expect(page.getByRole('heading', { name: examTitle })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Start exam' }).click()

    // Answer every question via navigator
    const navBtns = page.locator('.qnav button')
    await expect(navBtns.first()).toBeVisible({ timeout: 20_000 })
    const n = await navBtns.count()

    for (let i = 0; i < n; i++) {
      await navBtns.nth(i).click()
      const mcq = page.locator('[role=radiogroup] .choice').first()
      const written = page.locator('#ans')
      if (await mcq.isVisible().catch(() => false)) {
        await mcq.click()
      } else if (await written.isVisible().catch(() => false)) {
        await written.fill(
          'In my own words: hash tables and binary search trees organise keys for efficient lookup and insertion using buckets or ordered child links.',
        )
      }
    }

    await page.getByRole('button', { name: /Submit exam/i }).first().click()
    // Modal confirm
    const dialog = page.locator('#modal-box, .modal').first()
    await dialog.waitFor({ state: 'visible' })
    await dialog.getByRole('button', { name: 'Submit exam' }).click()

    await expect(page.getByRole('heading', { name: 'Exam submitted', exact: true })).toBeVisible({
      timeout: 90_000,
    })
  })

  test('6. Teacher reviews results and releases', async ({ page }) => {
    await loginAs(page, 'teacher')
    expect(examId).toBeTruthy()
    await page.goto(`/app/teacher/exams/${examId}/results`)
    await expect(page.getByRole('heading', { name: new RegExp(`Results · ${examTitle}`) })).toBeVisible({
      timeout: 30_000,
    })

    // Optional: open first attempt Review (not the sidebar "Review N need attention")
    const reviewBtn = page
      .locator('main')
      .getByRole('button', { name: /Review .+submission/i })
      .first()
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click()
      await expect(page).toHaveURL(/\/app\/teacher\/attempts\//)
      const clearBtn = page.getByRole('button', { name: /Clear flag/i }).first()
      if (await clearBtn.isVisible().catch(() => false)) {
        await clearBtn.click()
        await expect(page.getByText(/Flag cleared|Grade stands/i).first()).toBeVisible({
          timeout: 15_000,
        })
      }
      await page.goto(`/app/teacher/exams/${examId}/results`)
    }

    const release = page.getByRole('button', { name: /Release results/i })
    await expect(release).toBeEnabled({ timeout: 20_000 })
    await release.click()
    await confirmModal(page, 'Release results')
    await expect(page.getByText(/Results released/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test('7. Student sees feedback', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/results')
    const row = page.locator('.lrow, tr').filter({ hasText: examTitle })
    await expect(row.first()).toBeVisible({ timeout: 20_000 })
    await row.first().getByRole('link', { name: /View feedback/i }).click()
    await expect(page.getByRole('heading', { name: new RegExp(`Feedback · ${examTitle}`) })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(/%/).first()).toBeVisible()
  })

  test('8. Admin activity log shows recent events', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/app/admin/settings?tab=activity')
    await expect(page.getByRole('columnheader', { name: 'What happened' })).toBeVisible()
    // At least one of the loop actions should appear in the log
    await expect(
      page
        .locator('table tbody')
        .getByText(/Released|Published|Approved|Submitted|Generated|request/i)
        .first(),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('sign out and sign in as another role', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(/\/app\/admin/)
    await loginAs(page, 'teacher')
    await expect(page).toHaveURL(/\/app\/teacher/)
    await expect(page.getByText(/TEACHER PORTAL/i).first()).toBeVisible()
  })
})
