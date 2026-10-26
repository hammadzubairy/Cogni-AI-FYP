/**
 * Verify every bug captured in /errors is fixed.
 * Screenshots land in errors/verified/ (repo root).
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, 'fixtures')
const OUT = path.resolve(__dirname, '../../errors/verified')

const PDF = path.join(FIXTURES, 'sample-lecture.pdf')
const DOCX = path.join(FIXTURES, 'sample-assignment.docx')
const PPTX = path.join(FIXTURES, 'sample-slides.pptx')
const SCANNED = path.join(FIXTURES, 'scanned-empty.pdf')

const UNIQUE = `err-${Date.now().toString(36)}`
const UNIQUE_PDF_NAME = `${UNIQUE}-lecture.pdf`

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${id}.png`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: file, fullPage: true })
  // eslint-disable-next-line no-console
  console.log(`[${id}] ${title} → errors/verified/${id}.png`)
}

async function selectTeacherClass(page, code = /CS-201-A/i) {
  const sel = page.locator('#mat-cls')
  if (await sel.count()) {
    const opts = await sel.locator('option').allTextContents()
    const idx = opts.findIndex((t) => code.test(t))
    if (idx >= 0) await sel.selectOption({ index: idx })
  }
}

async function uploadNamedFile(page, filePath, displayName) {
  const buf = fs.readFileSync(filePath)
  await page.locator('#mat-file').setInputFiles({
    name: displayName,
    mimeType:
      displayName.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : displayName.endsWith('.pptx')
          ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          : 'application/pdf',
    buffer: buf,
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('errors/ folder — verify fixes', () => {
  test.setTimeout(180_000)

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
    for (const name of [PDF, DOCX, PPTX, SCANNED]) {
      expect(fs.existsSync(name), `missing fixture ${name}`).toBeTruthy()
    }
  })

  test('E7 admin departments load without credentials error', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/app/admin/departments')
    await expect(page.getByRole('heading', { name: 'Departments' })).toBeVisible()
    await expect(page.getByText(/Could not validate credentials/i)).toHaveCount(0)
    await expect(page.getByText(/Computer Science/i).first()).toBeVisible()
    await snap(page, 'E7-admin-departments', 'Admin departments list loads')
  })

  test('E2 DOCX upload succeeds', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible()
    await selectTeacherClass(page)
    await page.getByRole('button', { name: 'Files', exact: true }).click()
    await uploadNamedFile(page, DOCX, `${UNIQUE}-assignment.docx`)
    await page.getByRole('button', { name: 'Process material', exact: true }).click()
    await expect(page.getByText(/DOCX support is not installed/i)).toHaveCount(0)
    await expect(page.getByText(/Material saved|file.*saved/i).first()).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByText(new RegExp(`${UNIQUE}-assignment\\.docx`, 'i')).first()).toBeVisible()
    await snap(page, 'E2-docx-ok', 'DOCX uploaded successfully')
  })

  test('E3 PDF + PPTX upload; scanned PDF shows clear callout', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await selectTeacherClass(page)
    await page.getByRole('button', { name: 'Files', exact: true }).click()

    await uploadNamedFile(page, PDF, UNIQUE_PDF_NAME)
    await page.getByRole('button', { name: 'Process material', exact: true }).click()
    await expect(page.getByText(/Material saved|file.*saved/i).first()).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByText(new RegExp(UNIQUE_PDF_NAME, 'i')).first()).toBeVisible()

    await uploadNamedFile(page, PPTX, `${UNIQUE}-slides.pptx`)
    await page.getByRole('button', { name: 'Process material', exact: true }).click()
    await expect(page.getByText(/Material saved|file.*saved/i).first()).toBeVisible({
      timeout: 120_000,
    })
    await expect(page.getByText(new RegExp(`${UNIQUE}-slides\\.pptx`, 'i')).first()).toBeVisible()

    await uploadNamedFile(page, SCANNED, `${UNIQUE}-scanned.pdf`)
    await page.getByRole('button', { name: 'Process material', exact: true }).click()
    await expect(
      page.getByText(/scanned|OCR|Paste the text|live AI provider/i).first(),
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/support is not installed/i)).toHaveCount(0)
    await snap(page, 'E3-slides-pdf', 'PDF/PPTX ok; scanned PDF clear callout')
  })

  test('E1 duplicate file prompts replace', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await selectTeacherClass(page)
    await page.getByRole('button', { name: 'Files', exact: true }).click()

    const beforeCount = await page
      .locator('table tbody tr, .lrow')
      .filter({ hasText: new RegExp(UNIQUE_PDF_NAME, 'i') })
      .count()

    await uploadNamedFile(page, PDF, UNIQUE_PDF_NAME)
    await page.getByRole('button', { name: 'Process material', exact: true }).click()

    const dialog = page.locator('#modal-box, .modal').first()
    await expect(dialog.getByRole('heading', { name: /File already exists/i })).toBeVisible({
      timeout: 15_000,
    })
    await expect(dialog.getByText(/Want to replace it/i)).toBeVisible()
    await snap(page, 'E1-duplicate-replace', 'Replace confirm dialog for duplicate file')
    await dialog.getByRole('button', { name: 'Replace' }).click()

    await expect(page.getByText(/Material saved|file.*saved/i).first()).toBeVisible({
      timeout: 120_000,
    })

    const afterCount = await page
      .locator('table tbody tr, .lrow')
      .filter({ hasText: new RegExp(UNIQUE_PDF_NAME, 'i') })
      .count()
    expect(afterCount).toBeLessThanOrEqual(Math.max(beforeCount, 1))
  })

  test('E4 exam generates from small PDF material', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/exams/new')
    await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible({
      timeout: 20_000,
    })

    const cls = page.locator('#cf-cls')
    const opts = await cls.locator('option').allTextContents()
    const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
    expect(idx).toBeGreaterThanOrEqual(0)
    await cls.selectOption({ index: idx })

    const matLabel = page.locator('label, .check, .mat').filter({ hasText: new RegExp(UNIQUE_PDF_NAME, 'i') })
    await expect(matLabel.first()).toBeVisible({ timeout: 20_000 })
    const box = matLabel.first().locator('input[type=checkbox]').or(
      page.getByRole('checkbox', { name: new RegExp(UNIQUE_PDF_NAME, 'i') }),
    )
    if (await box.count()) {
      await box.first().check()
    } else {
      await matLabel.first().click()
    }

    const title = `Errors Verify ${UNIQUE}`
    await page.locator('#cf-title').fill(title)
    await page.locator('#cf-kind').selectOption('Quiz')
    await page.locator('#cf-mcq').fill('2')
    await page.locator('#cf-short').fill('1')
    await page.locator('#cf-essay').fill('0')

    await Promise.all([
      page.waitForURL(
        (url) => {
          const m = url.pathname.match(/\/app\/teacher\/exams\/([^/]+)\/?$/)
          return !!(m && m[1] && m[1] !== 'new')
        },
        { timeout: 120_000 },
      ),
      page.getByRole('button', { name: 'Generate draft paper' }).click(),
    ])

    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Q1|Question/i).first()).toBeVisible({ timeout: 15_000 })
    await snap(page, 'E4-exam-generated', 'Exam draft generated from small PDF')
  })

  test('E5 study assistant page labels are clear', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible({
      timeout: 20_000,
    })

    // Prefer our uploaded doc if listed
    const ourDoc = page.locator('button.doc').filter({ hasText: new RegExp(UNIQUE, 'i') }).first()
    if (await ourDoc.count()) {
      await ourDoc.click()
    }

    await page.getByRole('button', { name: /Summarise the main ideas/i }).click()
    await expect(page.locator('.msg.a').filter({ hasNot: page.locator('.typing') }).last()).toBeVisible({
      timeout: 60_000,
    })

    await expect(
      page.getByText(/Page numbers refer to locations in the selected document/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    const srcText = await page.locator('.src').allTextContents()
    for (const s of srcText) {
      expect(s).not.toMatch(/\d+\s+of\s+\d+/i)
    }
    if (srcText.length) {
      expect(srcText.some((s) => /Page\s+\d+\s+in document/i.test(s))).toBeTruthy()
    }
    await snap(page, 'E5-page-labels', 'Study assistant page citation labels')
  })

  test('E6 score save does not full-page reload', async ({ page, request }) => {
    // Resolve a seeded submitted attempt via API, then open review UI
    const login = await request.post('http://127.0.0.1:8000/api/auth/login', {
      data: { email: 'ayesha.khan@umt.edu.pk', password: 'Test-Passw0rd!' , role: 'teacher' },
    })
    expect(login.ok()).toBeTruthy()
    const token = (await login.json()).access_token
    const headers = { Authorization: `Bearer ${token}` }

    const examsRes = await request.get('http://127.0.0.1:8000/api/exams', { headers })
    const exams = await examsRes.json()
    const quiz = (exams || []).find((e) => /Quiz 3: Graphs/i.test(e.title || ''))
    expect(quiz?.id).toBeTruthy()

    const resultsRes = await request.get(
      `http://127.0.0.1:8000/api/exams/${quiz.id}/results`,
      { headers },
    )
    const results = await resultsRes.json()
    const attemptId =
      results?.attempts?.[0]?.attempt_id || results?.attempts?.[0]?.id
    expect(attemptId).toBeTruthy()

    await loginAs(page, 'teacher')
    await page.goto(`/app/teacher/attempts/${attemptId}`)
    await expect(page.getByText(/Override score/i).first()).toBeVisible({ timeout: 20_000 })

    // Scroll down so a full remount would jump to top
    await page.evaluate(() => window.scrollTo(0, 400))
    const scrollBefore = await page.evaluate(() => window.scrollY)

    const input = page.locator('input[id^="ov-"]').first()
    await expect(input).toBeVisible()
    const max = Number(await input.getAttribute('max')) || 2
    const next = max >= 1 ? 1 : 0
    await input.fill(String(next))

    const loadingAppeared = page
      .waitForSelector('text=Loading submission', { state: 'visible', timeout: 2_500 })
      .then(() => true)
      .catch(() => false)

    await page.getByRole('button', { name: 'Save score' }).first().click()
    await expect(page.getByText(/Score saved/i).first()).toBeVisible({ timeout: 20_000 })

    const didFullReload = await loadingAppeared
    expect(didFullReload).toBeFalsy()

    // Page still shows question cards (not replaced by shell loader)
    await expect(page.getByText(/Override score/i).first()).toBeVisible()
    const scrollAfter = await page.evaluate(() => window.scrollY)
    expect(scrollAfter).toBeGreaterThanOrEqual(Math.min(scrollBefore, 100))

    await snap(page, 'E6-score-soft-save', 'Score saved without full-page spinner')
  })
})
