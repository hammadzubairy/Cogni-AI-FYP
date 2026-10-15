import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs } from './helpers/auth.js'
import { resetScreenshots, snap, writeScreenshotIndex } from './helpers/screenshots.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_PDF = path.resolve(__dirname, '../../../AutoExam FYP Report 1 (FINAL).pdf')

test.describe.configure({ mode: 'serial' })

test.describe('Local lecture PDF upload → Mongo', () => {
  test.setTimeout(180_000)

  test.beforeAll(() => {
    resetScreenshots()
  })

  test.afterAll(() => {
    writeScreenshotIndex()
  })

  test('teacher uploads local FYP report PDF and sees it in materials', async ({ page, request }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible()

    if (await page.locator('#mat-cls').count()) {
      const opts = await page.locator('#mat-cls option').allTextContents()
      const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
      if (idx >= 0) await page.locator('#mat-cls').selectOption({ index: idx })
    }

    await page.getByRole('button', { name: 'PDF', exact: true }).click()
    await page.locator('#mat-file').setInputFiles(LOCAL_PDF)
    await snap(page, 'upload-pdf-ready', 'Local FYP report PDF selected for upload')

    await page.getByRole('button', { name: 'Process material', exact: true }).click()
    await expect(page.getByText(/Material saved/i)).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/AutoExam FYP Report/i).first()).toBeVisible({ timeout: 20_000 })
    await snap(page, 'upload-pdf-saved', 'Local lecture PDF listed after upload')

    // Confirm via API that Mongo-backed list contains the file
    const login = await request.post('http://127.0.0.1:8000/api/auth/login', {
      data: { email: 'ayesha.khan@umt.edu.pk', password: 'Test-Passw0rd!' },
    })
    const token = (await login.json()).access_token
    const classes = await request.get('http://127.0.0.1:8000/api/classes', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const cls = (await classes.json()).find((c) => /CS-201-A/i.test(c.code))
    const mats = await request.get(`http://127.0.0.1:8000/api/classes/${cls.id}/materials`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await mats.json()
    expect(list.some((m) => /AutoExam FYP Report/i.test(m.name) && m.kind === 'pdf')).toBeTruthy()
    const hit = list.find((m) => /AutoExam FYP Report/i.test(m.name))
    expect(hit.chunk_count).toBeGreaterThan(0)
    expect(hit.word_count).toBeGreaterThan(1000)
  })
})
