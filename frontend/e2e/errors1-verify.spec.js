/**
 * Verify /errors/errors1 fixes. Screenshots → errors/errors1/verified/
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { confirmModal, loginAs } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../errors/errors1/verified')

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${id}.png`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: file, fullPage: true })
  // eslint-disable-next-line no-console
  console.log(`[${id}] ${title} → errors/errors1/verified/${id}.png`)
}

test.describe.configure({ mode: 'serial' })

test.describe('errors/errors1 — verify fixes', () => {
  test.setTimeout(180_000)

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
  })

  test('F1 long material names use ellipsis', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible({
      timeout: 20_000,
    })

    const nameEl = page.locator('.doc-name').first()
    await expect(nameEl).toBeVisible()

    const style = await nameEl.evaluate((el) => {
      const long =
        'Cogni_ai_Functional_Quality_Testing_Report_Very_Long_Filename_For_Ellipsis.pdf'
      el.textContent = long
      const cs = getComputedStyle(el)
      return {
        overflow: cs.overflow,
        textOverflow: cs.textOverflow,
        whiteSpace: cs.whiteSpace,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }
    })

    expect(style.textOverflow).toBe('ellipsis')
    expect(style.overflow).toMatch(/hidden/)
    expect(style.whiteSpace).toBe('nowrap')
    expect(style.scrollWidth).toBeGreaterThan(style.clientWidth)

    await snap(page, 'F1-name-ellipsis', 'Study material names truncate with ellipsis')
  })

  test('F2 clear chat button resets thread', async ({ page }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible({
      timeout: 20_000,
    })

    const clearBtn = page.locator('button.doc-clear').first()
    await expect(clearBtn).toBeVisible()

    await page.getByRole('button', { name: /Summarise the main ideas/i }).click()
    await expect(page.locator('.msg.u').first()).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('.msg.a').filter({ hasNot: page.locator('.typing') }).last(),
    ).toBeVisible({ timeout: 60_000 })

    const beforeCount = await page.locator('.msg').count()
    expect(beforeCount).toBeGreaterThan(1)

    await snap(page, 'F2-clear-chat-control', 'Clear chat trash on material rows')

    await clearBtn.click()
    await confirmModal(page, 'Clear chat')

    await expect(page.locator('.msg.u')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('.msg.a')).toHaveCount(1)
    await expect(page.getByText(/Ask me anything about/i).first()).toBeVisible()

    await snap(page, 'F2-chat-cleared', 'Chat cleared back to greeting')
  })

  test('F3 Process material clears dropzone on class embed', async ({ page, request }) => {
    const login = await request.post('http://127.0.0.1:8000/api/auth/login', {
      data: { email: 'ayesha.khan@umt.edu.pk', password: 'Test-Passw0rd!' , role: 'teacher' },
    })
    expect(login.ok()).toBeTruthy()
    const token = (await login.json()).access_token
    const classes = await (
      await request.get('http://127.0.0.1:8000/api/classes', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
    const cls = (classes || []).find((c) => /CS-201-A/i.test(c.code))
    expect(cls?.id).toBeTruthy()

    await loginAs(page, 'teacher')
    await page.goto(`/app/teacher/classes/${cls.id}?tab=material`)
    await expect(page.getByRole('button', { name: 'Process material', exact: true })).toBeVisible({
      timeout: 20_000,
    })

    const filesTab = page.getByRole('button', { name: 'Files', exact: true })
    if (await filesTab.count()) await filesTab.click()

    const gap = await page.evaluate(() => {
      const d = document.querySelector('label.drop')
      const b = [...document.querySelectorAll('button')].find((el) =>
        /Process material/i.test(el.textContent || ''),
      )
      if (!d || !b) return null
      const dr = d.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return {
        gap: br.top - dr.bottom,
        dropMarginBottom: getComputedStyle(d).marginBottom,
      }
    })

    expect(gap).toBeTruthy()
    expect(gap.gap).toBeGreaterThanOrEqual(10)
    expect(parseFloat(gap.dropMarginBottom)).toBeGreaterThanOrEqual(10)

    await snap(page, 'F3-process-dropzone-gap', 'Class material tab — Process clears dropzone')
  })
})
