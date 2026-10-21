/**
 * Screenshot proof for UI work done after the proof-fixes PR:
 * accent tab counts, portal fonts/colors, study formatting, AI gold chrome.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, 'screenshots/proof-post-pr')

let n = 0
const index = []

function resetOut() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const name of fs.readdirSync(OUT)) {
    if (name.endsWith('.png') || name === 'INDEX.md') fs.unlinkSync(path.join(OUT, name))
  }
  n = 0
  index.length = 0
}

async function proof(page, slug, title) {
  n += 1
  const id = String(n).padStart(2, '0')
  const file = `POST${id}-${slug}.png`
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, file), fullPage: true })
  index.push({ id: `POST${id}`, file, title })
  console.log(`[POST${id}] ${title}`)
}

function writeIndex() {
  const lines = [
    '# Proof: post-PR UI fixes',
    '',
    'Work after the proof-fixes PR (accent counts, portal fonts/colors, study format, gold AI chrome).',
    '',
    '| # | File | Shows |',
    '| --- | --- | --- |',
    ...index.map((r) => `| ${r.id} | \`${r.file}\` | ${r.title} |`),
    '',
  ]
  fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'))
}

test.describe.configure({ mode: 'serial' })

test.describe('Proof screenshots — post-PR fixes', () => {
  test.setTimeout(180_000)

  test.beforeAll(() => {
    resetOut()
  })

  test.afterAll(() => {
    writeIndex()
  })

  test('01 admin users — gold tab counts + crimson ADMIN PORTAL', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/app/admin/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    await expect(page.locator('.portal.r-admin')).toBeVisible()
    await expect(page.locator('.tabs button .tab-count').first()).toBeVisible()
    await proof(
      page,
      'admin-users-gold-counts-crimson-portal',
      'Admin Users — gold tab counts + crimson ADMIN PORTAL label',
    )
  })

  test('02 teacher portal — gold label + readable Geist heading', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher')
    await expect(page.locator('.portal.r-teacher')).toBeVisible()
    await expect(page.getByText(/TEACHER PORTAL/i).first()).toBeVisible()
    await proof(
      page,
      'teacher-portal-gold-geist',
      'Teacher portal — gold TEACHER PORTAL + readable page heading font',
    )
  })

  test('03 student portal — gold STUDENT PORTAL (not teal)', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/study')
    await expect(page.locator('.portal.r-student')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible()
    await proof(
      page,
      'student-portal-gold',
      'Student portal — gold STUDENT PORTAL + readable Study assistant heading',
    )
  })

  test('04 study assistant — formatted practice question sections', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible()
    const firstDoc = page.locator('.docs .doc').first()
    await expect(firstDoc).toBeVisible({ timeout: 30_000 })
    await firstDoc.click()
    await page.getByRole('button', { name: /Give me a practice question/i }).click()
    await expect(page.locator('.msg-h').filter({ hasText: /Practice question/i })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('.msg-h').filter({ hasText: /Good answer/i })).toBeVisible()
    await proof(
      page,
      'study-practice-formatted',
      'Study assistant — Practice question / Good answer sections (not one blob)',
    )
  })

  test('05 study assistant — typing bubble matches assistant chrome', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/study')
    const firstDoc = page.locator('.docs .doc').first()
    await expect(firstDoc).toBeVisible({ timeout: 30_000 })
    await firstDoc.click()

    // Hold the ask request so the typing indicator stays visible for the shot.
    await page.route('**/api/materials/*/ask', async (route) => {
      await new Promise((r) => setTimeout(r, 2500))
      await route.continue()
    })

    await page.locator('#cq').fill('Summarise the main ideas')
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(page.locator('.msg.typing')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.msg.typing .chip-study')).toBeVisible()
    await proof(
      page,
      'study-typing-bubble',
      'Study assistant — typing bubble with chip (not tiny yellow stub)',
    )
    await page.unroute('**/api/materials/*/ask')
  })

  test('06 HOD portal — orange label', async ({ page }) => {
    await loginAs(page, 'hod')
    await page.goto('/app/hod')
    await expect(page.locator('.portal.r-hod')).toBeVisible()
    await proof(page, 'hod-portal-orange', 'HOD portal — orange HOD PORTAL label')
  })

  test('07 HOD review — gold AI draft card (no purple Claude chrome)', async ({ page }) => {
    await loginAs(page, 'hod')
    await page.goto('/app/hod/approvals')
    await expect(page.getByRole('heading', { name: 'Paper approvals' })).toBeVisible()

    // Open first reviewable paper (pending or any row with a Review/Open path).
    const reviewLink = page.locator('a[href*="/app/hod/approvals/"], tr.click, button:has-text("Review")').first()
    if (await page.locator('tr.click').count()) {
      await page.locator('tr.click').first().click()
    } else if (await page.getByRole('link', { name: /Review|Open/i }).count()) {
      await page.getByRole('link', { name: /Review|Open/i }).first().click()
    } else {
      // Fallback: hit first exam id from API via table cell click
      await page.locator('table tbody tr').first().click()
    }

    await expect(page.locator('.qcard, .chip-ai, .ai-card').first()).toBeVisible({
      timeout: 30_000,
    })
    await proof(
      page,
      'hod-review-gold-ai',
      'HOD review — gold AI draft chip/card (no purple left border)',
    )
  })
})
