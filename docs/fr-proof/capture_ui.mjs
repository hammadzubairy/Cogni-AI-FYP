import { chromium } from '../../frontend/node_modules/playwright/index.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'screenshots')
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8000'
const TEACHER = { email: 'ayesha.khan@umt.edu.pk', password: 'Test-Passw0rd!' }
fs.mkdirSync(SHOTS, { recursive: true })

async function loginApi() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEACHER),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(j))
  return j
}

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true })
  console.log('shot', name, fs.statSync(p).size)
}

const auth = await loginApi()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text())
})
page.on('pageerror', (err) => console.log('PAGEERROR', err.message))

await page.goto(`${BASE}/login`)
// Inject session the same way the app stores it
await page.evaluate((payload) => {
  localStorage.setItem('cogni-token', payload.access_token)
  if (payload.user) localStorage.setItem('cogni-user', JSON.stringify(payload.user))
}, auth)

await page.goto(`${BASE}/app/teacher`)
await page.waitForTimeout(2500)
await shot(page, '10-dashboard')

await page.goto(`${BASE}/app/teacher/materials`)
await page.waitForSelector('text=Course material, text=Upload, text=All my material, text=Could not, text=Create a class', {
  timeout: 45000,
}).catch(() => {})
await page.waitForTimeout(2000)
await shot(page, '11-materials')

// Click Web link if present
const web = page.locator('button', { hasText: 'Web link' })
if (await web.count()) {
  await web.click()
  await page.waitForTimeout(500)
  await shot(page, '12-materials-url-tab')
  console.log('Web link tab OK')
} else {
  console.log('Web link tab missing; page text:', (await page.locator('body').innerText()).slice(0, 500))
}

const files = page.locator('button', { hasText: 'Files' })
if (await files.count()) {
  await files.click()
  await page.waitForTimeout(400)
  await shot(page, '13-materials-files-tab')
}

// Class detail (likely has materials embedded)
const classes = await fetch(`${API}/api/classes`, {
  headers: { Authorization: `Bearer ${auth.access_token}` },
}).then((r) => r.json())
const cls = classes.find((c) => c.code === 'CS-201-A') || classes[0]
await page.goto(`${BASE}/app/teacher/classes/${cls.id}`)
await page.waitForTimeout(2500)
await shot(page, '14-class-detail')

// material tab if any
const matTab = page.locator('button', { hasText: /material/i }).first()
if (await matTab.count()) {
  await matTab.click()
  await page.waitForTimeout(1500)
  await shot(page, '15-class-materials-tab')
}

// Exam detail from report if exists
const reportPath = path.join(__dirname, 'report.json')
if (fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  if (report.exam?.id) {
    await page.goto(`${BASE}/app/teacher/exams/${report.exam.id}`)
    await page.waitForTimeout(2500)
    await shot(page, '16-exam-editor')
  }
  const attemptStep = report.steps.find((s) => s.attempt_id)
  if (attemptStep?.attempt_id) {
    await page.goto(`${BASE}/app/teacher/attempts/${attemptStep.attempt_id}`)
    await page.waitForTimeout(2500)
    await shot(page, '17-attempt-review-grading')
  }
  await page.goto(`${BASE}/app/teacher/exams/${report.exam.id}/results`)
  await page.waitForTimeout(2500)
  await shot(page, '18-exam-results')
}

await browser.close()
console.log('done')
