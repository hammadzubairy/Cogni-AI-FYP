/**
 * Prove exam tab-lock + exit forfeit with screenshots → e2e/screenshots/exam-lock/
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs, WORLD_PASSWORD } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, 'screenshots/exam-lock')
const API = 'http://127.0.0.1:8000/api'
const INDEX = []

const TEACHER = 'ayesha.khan@umt.edu.pk'
/** Fresh student — avoid colliding with seeded submitted attempts */
const STUDENT = 'sana.iqbal@umt.edu.pk'

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${id}.png`)
  await page.waitForTimeout(400)
  await page.screenshot({ path: file, fullPage: true })
  INDEX.push({ id, title, file: `${id}.png` })
  // eslint-disable-next-line no-console
  console.log(`[${id}] ${title} → e2e/screenshots/exam-lock/${id}.png`)
}

async function apiLogin(request, email, role) {
  const login = await request.post(`${API}/auth/login`, {
    data: { email, password: WORLD_PASSWORD, role },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
  return (await login.json()).access_token
}

async function publishQuiz(request, title) {
  const token = await apiLogin(request, TEACHER, 'teacher')
  const headers = { Authorization: `Bearer ${token}` }
  const classes = await (await request.get(`${API}/classes`, { headers })).json()
  const cls = (classes || []).find((c) => c.code === 'CS-201-A')
  expect(cls?.id).toBeTruthy()
  const materials = await (
    await request.get(`${API}/classes/${cls.id}/materials`, { headers })
  ).json()
  expect(materials?.[0]?.id).toBeTruthy()

  // Prefer mock LLM (Playwright webServer). Retry once; fall back to any open published exam.
  let exam = null
  for (let i = 0; i < 2; i++) {
    const gen = await request.post(`${API}/exams/generate`, {
      headers,
      data: {
        class_id: cls.id,
        title: i === 0 ? title : `${title}-${i}`,
        kind: 'Quiz',
        duration_min: 20,
        material_ids: [materials[0].id],
        counts: { MCQ: 1, Short: 1 },
      },
    })
    if (gen.ok()) {
      exam = (await gen.json()).exam
      break
    }
  }
  if (!exam) {
    const exams = await (await request.get(`${API}/exams?class_id=${cls.id}`, { headers })).json()
    const published = (exams || []).find((e) => e.status === 'published' && e.title)
    expect(published?.id, 'Need a published exam when generate fails').toBeTruthy()
    // Ensure this student has no attempt yet — pick published with no sana attempt
    const stToken = await apiLogin(request, STUDENT, 'student')
    const mine = await (
      await request.get(`${API}/attempts/mine`, {
        headers: { Authorization: `Bearer ${stToken}` },
      })
    ).json()
    const taken = new Set((mine || []).map((a) => a.exam_id))
    const open = (exams || []).find((e) => e.status === 'published' && !taken.has(e.id))
    expect(open?.id, 'No unused published exam for lock student').toBeTruthy()
    return open.id
  }
  const pub = await request.post(`${API}/exams/${exam.id}/publish`, { headers })
  expect(pub.ok(), await pub.text()).toBeTruthy()
  return exam.id
}

/** Headless Chromium often rejects real fullscreen — stub so lock UI can run. */
async function stubFullscreen(page) {
  await page.addInitScript(() => {
    let fsEl = null
    Object.defineProperty(Document.prototype, 'fullscreenElement', {
      configurable: true,
      get() {
        return fsEl
      },
    })
    Element.prototype.requestFullscreen = async function requestFullscreen() {
      fsEl = this
      document.dispatchEvent(new Event('fullscreenchange'))
    }
    Document.prototype.exitFullscreen = async function exitFullscreen() {
      fsEl = null
      document.dispatchEvent(new Event('fullscreenchange'))
    }
  })
}

async function studentUiLogin(page) {
  await loginAs(page, 'student', {
    email: STUDENT,
    portal: 'student',
    expectHome: '/app/student',
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('Exam lock proof', () => {
  test.setTimeout(180_000)

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
  })

  test.afterAll(() => {
    const lines = [
      '# Exam lock proof screenshots',
      '',
      '| ID | Title | File |',
      '|----|-------|------|',
      ...INDEX.map((r) => `| ${r.id} | ${r.title} | ${r.file} |`),
      '',
    ]
    fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'))
  })

  test('LOCK01 gate shows lockdown rules', async ({ page, request }) => {
    const title = `Lock proof gate ${Date.now().toString(36)}`
    const examId = await publishQuiz(request, title)
    await stubFullscreen(page)
    await studentUiLogin(page)
    await page.goto(`/app/student/exams/${examId}/take`)
    await expect(page.getByRole('heading', { name: /Before you start/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(/fullscreen lock/i)).toBeVisible()
    await expect(page.getByText(/3 violations/i)).toBeVisible()
    await snap(page, 'LOCK01-gate-rules', 'Before-you-start gate lists fullscreen lock rules')
  })

  test('LOCK02 taking UI + violation overlay', async ({ page, request }) => {
    const title = `Lock proof take ${Date.now().toString(36)}`
    const examId = await publishQuiz(request, title)
    await stubFullscreen(page)
    await studentUiLogin(page)
    await page.goto(`/app/student/exams/${examId}/take`)
    await expect(page.getByRole('button', { name: /^Start exam$/i })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: /^Start exam$/i }).click()
    await expect(page.getByRole('region', { name: /Exam status/i })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: /Exit exam/i })).toBeVisible()
    await snap(page, 'LOCK02-taking-locked', 'Exam taking bar with Exit + lock counter')

    // Wait for lock arm (~600ms), then leave stubbed fullscreen (counts as a violation)
    await page.waitForTimeout(800)
    await page.evaluate(async () => {
      await document.exitFullscreen()
    })

    const overlay = page.locator('.exam-lock-overlay')
    await expect(overlay.getByRole('heading', { name: /Return to the exam/i })).toBeVisible({
      timeout: 10_000,
    })
    await expect(overlay.locator('b')).toHaveText(/1\s*\/\s*3/)
    await snap(page, 'LOCK03-violation-overlay', 'Lock overlay after fullscreen-exit violation')

    await page.getByRole('button', { name: /Return to fullscreen/i }).click()
    await expect(page.getByRole('heading', { name: /Return to the exam/i })).toHaveCount(0, {
      timeout: 10_000,
    })
  })

  test('LOCK04 exit forfeits only attempt', async ({ page, request }) => {
    const title = `Lock proof exit ${Date.now().toString(36)}`
    const examId = await publishQuiz(request, title)
    await stubFullscreen(page)
    await studentUiLogin(page)
    await page.goto(`/app/student/exams/${examId}/take`)
    await page.getByRole('button', { name: /^Start exam$/i }).click()
    await expect(page.getByRole('button', { name: /Exit exam/i })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: /Exit exam/i }).click()
    await expect(page.getByRole('heading', { name: /Exit exam\?/i })).toBeVisible()
    await snap(page, 'LOCK04-exit-confirm', 'Exit confirm warns that only attempt is forfeited')

    await page.getByRole('button', { name: /Exit and forfeit attempt/i }).click()
    await expect(page).toHaveURL(/\/app\/student\/attempts\/.+\/done/, { timeout: 30_000 })
    await snap(page, 'LOCK05-forfeit-done', 'After exit forfeit — attempt done page')

    // Cannot start again
    await page.goto(`/app/student/exams/${examId}/take`)
    await expect(page.getByText(/already submitted/i)).toBeVisible({ timeout: 20_000 })
    await snap(page, 'LOCK06-no-retake', 'Take URL after forfeit — already submitted, no retake')
  })
})
