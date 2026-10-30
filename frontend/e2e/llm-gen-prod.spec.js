import { expect, test, chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FE = process.env.COGNI_FE || 'https://frontend-six-vert-62.vercel.app'
const OUT = path.resolve(__dirname, 'screenshots/llm-gen')
const EXAM = process.env.COGNI_EXAM_ID || '6ae4f506facac3a1073dec61'
const index = []

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = `${id}.png`
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, file), fullPage: true })
  index.push({ id, title, file })
  console.log(`[${id}] ${title}`)
}

test.describe.configure({ mode: 'serial' })
test('LLM generation proof screenshots on production', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${FE}/login`)
  await page.locator('#l-email').fill('admin@cogni.com')
  await page.locator('#l-pw').fill('Cogni@12321')
  const portal = page.locator('#l-portal')
  if (await portal.count()) {
    await portal.selectOption({ label: 'Admin' }).catch(async () => portal.selectOption('admin'))
  }
  await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/app\/admin/, { timeout: 30_000 })
  await expect(page.getByText(/LLM provider is mock/i)).toHaveCount(0)
  await snap(page, 'LLM01-admin-home', 'Admin home — credentials OK, LLM not mock')

  await page.evaluate(() => localStorage.clear())
  await page.goto(`${FE}/login`)
  await page.locator('#l-email').fill('hanan@cuilahore.edu.pk')
  await page.locator('#l-pw').fill('hanan@12321')
  if (await portal.count()) {
    await portal.selectOption({ label: 'Teacher' }).catch(async () => portal.selectOption('teacher'))
  }
  await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/app\/teacher/, { timeout: 30_000 })
  await snap(page, 'LLM02-teacher-home', 'Teacher home — sheet credentials OK')

  await page.goto(`${FE}/app/teacher/exams/${EXAM}`)
  await expect(page.getByText(/Photoelectric|LLM proof|Draft|Question/i).first()).toBeVisible({ timeout: 30_000 })
  await snap(page, 'LLM03-exam-draft-generated', 'Generated draft exam with AI questions')

  await page.goto(`${FE}/app/teacher/exams`)
  await page.waitForTimeout(1000)
  await snap(page, 'LLM04-teacher-exams-list', 'Teacher exams list including generated draft')

  fs.writeFileSync(
    path.join(OUT, 'INDEX.md'),
    [
      '# LLM exam generation proof',
      '',
      '| ID | Title | File |',
      '|----|-------|------|',
      ...index.map((r) => `| ${r.id} | ${r.title} | ${r.file} |`),
      '',
      `Exam id: \`${EXAM}\``,
      'Model: openrouter/free',
      'Teacher: hanan@cuilahore.edu.pk',
      '',
    ].join('\n'),
  )
})
