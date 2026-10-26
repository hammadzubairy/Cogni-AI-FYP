import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSession, loginAs, WORLD_PASSWORD } from './helpers/auth.js'
import { resetScreenshots, snap, writeScreenshotIndex, SCREENSHOT_DIR } from './helpers/screenshots.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(SCREENSHOT_DIR, 'groq-verify')

const SAMPLE_NOTES = `
Binary search trees store ordered keys so that left children are smaller and right
children are larger than the parent. Searching, insertion and deletion average
O(log n) time on balanced trees. Unbalanced trees degrade toward O(n).

A heap is a complete binary tree that satisfies the heap property: in a max-heap
every parent is at least as large as its children. Heaps power priority queues and
heap-sort. Graph traversal with BFS uses a queue; DFS uses a stack or recursion.
Shortest paths on unweighted graphs use BFS; Dijkstra handles non-negative weights.
`.repeat(2).trim()

/**
 * Live Groq LLM verification: paste notes → generate draft → capture screenshots.
 * Requires LLM_PROVIDER/openai + Groq key in the backend webServer env.
 */
test.describe.configure({ mode: 'serial' })

test.describe('Groq LLM material + generation', () => {
  test.setTimeout(300_000)

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
    // Isolate snaps into groq-verify by temporarily redirecting via custom paths
    resetScreenshots()
  })

  test.afterAll(() => {
    writeScreenshotIndex()
    // Copy INDEX + move SS files into groq-verify for clarity
    const indexSrc = path.join(SCREENSHOT_DIR, 'INDEX.md')
    if (fs.existsSync(indexSrc)) {
      fs.copyFileSync(indexSrc, path.join(OUT, 'INDEX.md'))
    }
    for (const name of fs.readdirSync(SCREENSHOT_DIR)) {
      if (name.startsWith('SS') && name.endsWith('.png')) {
        fs.copyFileSync(path.join(SCREENSHOT_DIR, name), path.join(OUT, name))
      }
    }
  })

  test('admin LLM status shows configured provider', async ({ page, request }) => {
    const health = await request.get('http://127.0.0.1:8000/api/health')
    expect(health.ok()).toBeTruthy()

    await loginAs(page, 'admin')
    await page.goto('/app/admin')
    await snap(page, 'groq-admin-home', 'Admin home (mock banner should be gone if Groq is live)')

    const login = await request.post('http://127.0.0.1:8000/api/auth/login', {
      data: { email: 'admin@cogni.pk', password: WORLD_PASSWORD , role: 'admin' },
    })
    expect(login.ok()).toBeTruthy()
    const token = (await login.json()).access_token
    const status = await request.get('http://127.0.0.1:8000/api/admin/llm-status', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(status.ok()).toBeTruthy()
    const body = await status.json()
    expect(body.provider).not.toBe('mock')
    expect(body.configured).toBeTruthy()
  })

  test('paste new lecture notes as material', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible()
    await snap(page, 'groq-materials-page', 'Teacher materials — PDF / Paste notes')

    await page.getByRole('button', { name: 'Paste notes', exact: true }).click()
    if (await page.locator('#mat-cls').count()) {
      const opts = await page.locator('#mat-cls option').allTextContents()
      const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
      if (idx >= 0) await page.locator('#mat-cls').selectOption({ index: idx })
    }
    await page.locator('#mat-name').fill('Groq live notes · Trees & Heaps')
    await page.locator('#mat-notes').fill(SAMPLE_NOTES)
    await snap(page, 'groq-paste-filled', 'Paste notes filled (≥300 chars)')
    await page.getByRole('button', { name: /Process material/i }).click()
    await expect(page.getByText(/Material saved/i)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/Groq live notes/i).first()).toBeVisible({ timeout: 20_000 })
    await snap(page, 'groq-paste-saved', 'New pasted material saved in list')
  })

  test('generate draft paper with live Groq LLM', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/exams/new')
    await expect(page.getByRole('heading', { name: /Generate a draft paper/i })).toBeVisible()

    const cls = page.locator('#cf-cls')
    const opts = await cls.locator('option').allTextContents()
    const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
    expect(idx).toBeGreaterThanOrEqual(0)
    await cls.selectOption({ index: idx })

    // Prefer the newly pasted material; fall back to any checkbox
    const labels = page.locator('label, .matpick, .row')
    // Check the pasted material by label; otherwise first available checkbox.
    const groqLabel = page.locator('label').filter({ hasText: /Groq live notes/i }).first()
    if (await groqLabel.count()) {
      const box = groqLabel.getByRole('checkbox')
      if (!(await box.isChecked())) await box.check()
    } else {
      const boxes = page.getByRole('checkbox')
      await expect(boxes.first()).toBeVisible({ timeout: 20_000 })
      const count = await boxes.count()
      for (let i = 0; i < count; i++) {
        if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check()
      }
    }

    await page.locator('#cf-title').fill(`Groq Live Quiz ${Date.now().toString(36)}`)
    await page.locator('#cf-kind').selectOption('Quiz')
    await page.locator('#cf-mcq').fill('2')
    await page.locator('#cf-short').fill('1')
    await page.locator('#cf-essay').fill('0')
    await snap(page, 'groq-generate-ready', 'Generate form ready (live Groq)')

    await Promise.all([
      page.waitForURL(
        (url) => {
          const m = url.pathname.match(/\/app\/teacher\/exams\/([^/]+)\/?$/)
          return !!(m && m[1] && m[1] !== 'new')
        },
        { timeout: 180_000 },
      ),
      page.getByRole('button', { name: 'Generate draft paper' }).click(),
    ])

    await expect(page.getByText(/Groq Live Quiz/i).first()).toBeVisible({ timeout: 30_000 })
    await snap(page, 'groq-exam-draft', 'Draft exam generated by Groq LLM')

    // Sanity: question cards from the live LLM draft
    await expect(page.locator('.qcard').first()).toBeVisible({ timeout: 15_000 })
    await snap(page, 'groq-exam-questions', 'Generated questions visible in editor')
  })

  test('reject scanned-style empty PDF message path documented', async ({ page }) => {
    await clearSession(page)
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await page.getByRole('button', { name: 'PDF', exact: true }).click()
    await snap(page, 'groq-pdf-tab-limits', 'PDF tab shows no-OCR / no-PPT limits')
  })
})
