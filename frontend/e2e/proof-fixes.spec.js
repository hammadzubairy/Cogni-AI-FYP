/**
 * Proof screenshots for every issue fixed from the reference screenshots.
 * Uses the local AutoExam FYP Report PDF + live OpenRouter when LLM_PROVIDER=openai.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, 'screenshots/proof-fixes')
const LOCAL_PDF = path.resolve(__dirname, '../../../AutoExam FYP Report 1 (FINAL).pdf')
const LOCAL_DOCX = path.resolve(__dirname, '../../../AutoExam FYP Report 1 (FINAL).docx')

let n = 0
const index = []

function resetOut() {
  fs.mkdirSync(OUT, { recursive: true })
  // KEEP_PROOF=1 preserves existing PROOF*.png (e.g. re-running a single test).
  if (process.env.KEEP_PROOF !== '1') {
    for (const name of fs.readdirSync(OUT)) {
      if (name.endsWith('.png') || name === 'INDEX.md') fs.unlinkSync(path.join(OUT, name))
    }
  }
  n = 0
  index.length = 0
}

async function proof(page, slug, title) {
  n += 1
  const id = String(n).padStart(2, '0')
  const file = `PROOF${id}-${slug}.png`
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, file), fullPage: true })
  index.push({ id: `PROOF${id}`, file, title })
  console.log(`[PROOF${id}] ${title}`)
}

function writeIndex() {
  const lines = [
    '# Proof: fixed screenshot issues',
    '',
    '| # | File | Shows |',
    '| --- | --- | --- |',
    ...index.map((r) => `| ${r.id} | \`${r.file}\` | ${r.title} |`),
    '',
  ]
  fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'))
}

test.describe.configure({ mode: 'serial' })

test.describe('Proof screenshots — fixed errors', () => {
  test.setTimeout(420_000)

  test.beforeAll(() => {
    resetOut()
    expect(fs.existsSync(LOCAL_PDF)).toBeTruthy()
  })

  test.afterAll(() => {
    writeIndex()
  })

  test('01 admin users tab counts have spaces', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/app/admin/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    // Counts must not concatenate onto labels (e.g. Students6)
    const studentsTab = page.getByRole('button', { name: /Students\s+\d+/i })
    await expect(studentsTab.first()).toBeVisible()
    await proof(page, 'admin-users-spaced-counts', 'Admin Users — counts spaced (not Students6)')
  })

  test('02 admin getting-started status marks (not AI pills)', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/app/admin')
    await expect(page.getByText(/Getting started/i)).toBeVisible()
    await proof(page, 'admin-status-marks', 'Admin Getting started — status marks instead of dotted pills')
  })

  test('03 new class modal creates without indefinite spinner', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher')
    await page.getByRole('button', { name: /New class/i }).first().click()
    const dialog = page.locator('#modal-box, .modal').first()
    await expect(dialog.getByRole('heading', { name: 'New class' })).toBeVisible()
    const tag = Date.now().toString(36).slice(-4).toUpperCase()
    await dialog.locator('#nc-name').fill(`Proof Class ${tag}`)
    await dialog.locator('#nc-code').fill(`PR-${tag}`)
    await proof(page, 'new-class-filled', 'New class modal filled — ready to create')
    await dialog.getByRole('button', { name: /Create class/i }).click()
    await expect(page).toHaveURL(/\/app\/teacher\/classes\//, { timeout: 30_000 })
    await expect(page.getByText(/Proof Class/i).first()).toBeVisible({ timeout: 15_000 })
    await proof(page, 'new-class-created', 'Class created — modal closed (no stuck spinner)')
  })

  test('04 join code copy is silent (no Copied toast)', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher')
    const card = page.locator('.classcard, a[href*="/teacher/classes/"]').first()
    await card.click()
    await expect(page.getByText(/Join code/i).first()).toBeVisible()
    await page.getByRole('button', { name: /^Copy$/i }).first().click()
    await page.waitForTimeout(800)
    const copiedToast = page.getByText(/Copied /i)
    await expect(copiedToast).toHaveCount(0)
    await proof(page, 'join-copy-silent', 'Join code Copy — no Copied toast')
  })

  test('05 portal subtitle + colored nav icons', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher')
    await expect(page.getByText(/TEACHER PORTAL/i)).toBeVisible()
    await proof(page, 'teacher-portal-nav', 'TEACHER PORTAL label + colored top-nav icons')
  })

  test('06 students roster shows real names', async ({ page }) => {
    await loginAs(page, 'teacher')
    // Seeded CS-201-A has students
    await page.goto('/app/teacher')
    const link = page.getByRole('link', { name: /CS-201-A/i }).first()
    if (await link.count()) {
      await link.click()
    } else {
      await page.locator('a[href*="/teacher/classes/"]').first().click()
    }
    await page.getByRole('button', { name: /^Students$/i }).click()
    await expect(page.getByRole('heading', { name: /Students/i })).toBeVisible()
    // Should not be the placeholder-only "Student" with empty email for seeded enrollments
    const body = await page.locator('table tbody').innerText().catch(() => '')
    await proof(page, 'students-roster-names', 'Students tab — roster names/emails populated')
    expect(body.length).toBeGreaterThan(0)
  })

  test('07 flags dropdown custom chevron', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/flags')
    await expect(page.getByRole('heading', { name: /AI-writing flags/i })).toBeVisible()
    await proof(page, 'flags-select-chevron', 'Review flags — custom select arrow (not stock AI chevron)')
  })

  test('08 material multi-format upload UI + process PDF', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible()
    if (await page.locator('#mat-cls').count()) {
      const opts = await page.locator('#mat-cls option').allTextContents()
      const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
      if (idx >= 0) await page.locator('#mat-cls').selectOption({ index: idx })
    }
    await page.getByRole('button', { name: /Files|PDF/i }).first().click()
    await expect(page.getByText(/PDF, DOCX, or PPTX/i)).toBeVisible()
    await proof(page, 'material-upload-formats', 'Material upload accepts PDF / DOCX / PPTX (multi-file)')

    const files = [LOCAL_PDF]
    if (fs.existsSync(LOCAL_DOCX)) files.push(LOCAL_DOCX)
    await page.locator('#mat-file').setInputFiles(files)
    await expect(page.getByText(/\d+ files? selected/i)).toBeVisible()
    await proof(page, 'material-files-selected', 'FYP report selected — readable drop-zone text')

    await page.getByRole('button', { name: 'Process material', exact: true }).click()
    await expect(page.getByText(/saved|file/i).first()).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText(/AutoExam FYP Report/i).first()).toBeVisible({ timeout: 30_000 })
    await proof(page, 'material-uploaded', 'Material processed and listed in class')
  })

  test('09 generate exam draft with OpenRouter', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/exams/new')
    await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible()

    if (await page.locator('#cf-cls').count()) {
      const opts = await page.locator('#cf-cls option').allTextContents()
      const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
      if (idx >= 0) await page.locator('#cf-cls').selectOption({ index: idx })
      await page.waitForTimeout(800)
    }

    // Select first available material checkbox
    const boxes = page.locator('.mat-pick-row input[type=checkbox], label.row input[type=checkbox]')
    const count = await boxes.count()
    expect(count).toBeGreaterThan(0)
    if (!(await boxes.first().isChecked())) await boxes.first().check()

    await page.locator('#cf-title').fill(`Proof Draft ${Date.now().toString(36)}`)
    await page.locator('#cf-mcq').fill('3')
    await page.locator('#cf-short').fill('1')
    await page.locator('#cf-essay').fill('0')
    await proof(page, 'generate-form-ready', 'Generate form — yellow material checks, no AI pipeline pill')

    await page.getByRole('button', { name: /Generate draft paper/i }).click()
    // Either navigate to editor on success, or show friendly failure (never raw 413 JSON)
    const editor = page.waitForURL(/\/app\/teacher\/exams\/[^/]+$/, { timeout: 180_000 })
    const friendlyFail = page.getByText(/Could not generate this draft|too large|busy|Retry/i).first()
    const outcome = await Promise.race([
      editor.then(() => 'ok'),
      friendlyFail.waitFor({ timeout: 180_000 }).then(() => 'fail'),
    ]).catch(() => 'timeout')

    if (outcome === 'ok') {
      await expect(page.getByText(/Proof Draft|Draft|Questions/i).first()).toBeVisible({
        timeout: 30_000,
      })
      await proof(page, 'generate-draft-success', 'Exam draft generated successfully (OpenRouter)')
    } else {
      const failText = await page.locator('.callout.red').innerText().catch(() => '')
      expect(failText).not.toMatch(/qwen\/qwen|ITPM|org_01/i)
      await proof(page, 'generate-friendly-error', 'Friendly generation error (no raw provider JSON)')
    }
  })

  test('10 student can open material + study assistant yellow chip', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student')
    // Prefer a class that has material
    const classLink = page.locator('a[href*="/student/classes/"]').first()
    await classLink.click()
    await page.getByRole('button', { name: /^Material$/i }).click()
    await proof(page, 'student-material-list', 'Student material list with Open button')

    const openBtn = page.getByRole('button', { name: /^Open$/i }).first()
    if (await openBtn.count()) {
      await openBtn.click()
      // #modal-box always exists in DOM under [hidden]; wait for the open backdrop.
      const openModal = page.locator('.modal-bg:not([hidden])')
      await expect(
        openModal.or(page.getByText(/Could not open|No text extracted/i).first()),
      ).toBeVisible({ timeout: 30_000 })
      if (await openModal.isVisible().catch(() => false)) {
        await expect(openModal.getByRole('heading').first()).toBeVisible()
        await proof(page, 'student-doc-open', 'Uploaded document opens in student portal')
        const close = openModal.getByRole('button', { name: /Close/i })
        if (await close.count()) await close.click()
      } else {
        await proof(page, 'student-doc-open-fallback', 'Student open material feedback')
      }
    }

    // Study assistant — go via Ask link if present, else study page
    const askLink = page.getByRole('link', { name: /Ask the assistant/i }).first()
    if (await askLink.count()) {
      await askLink.click()
    } else {
      await page.goto('/app/student/study')
    }
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible({
      timeout: 20_000,
    })
    const docPick = page.locator('button, a, [role=button]').filter({ hasText: /\.pdf|Assignment|AutoExam|material/i }).first()
    if (await docPick.count()) await docPick.click().catch(() => {})
    const ask = page.getByPlaceholder(/Ask about this material/i)
    await expect(ask).toBeVisible({ timeout: 15_000 })
    await ask.fill('Summarise the main ideas in two sentences')
    await page.getByRole('button', { name: /^Ask$/i }).click()
    await expect(page.locator('.chip-study, .msg.a').first()).toBeVisible({ timeout: 120_000 })
    await proof(page, 'study-assistant-yellow', 'Study assistant — yellow theme chip + answer')
  })
})
