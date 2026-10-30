/**
 * Proof: sign-out no credentials flash; Change Password universal eye (no double icon).
 * Screenshots → e2e/screenshots/auth-ui-fixes/
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSession, loginAs, loginWithPassword, WORLD_PASSWORD } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, 'screenshots/auth-ui-fixes')
const API = 'http://127.0.0.1:8000/api'
const INDEX = []

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${id}.png`)
  await page.waitForTimeout(350)
  await page.screenshot({ path: file, fullPage: true })
  INDEX.push({ id, title, file: `${id}.png` })
  // eslint-disable-next-line no-console
  console.log(`[${id}] ${title} → e2e/screenshots/auth-ui-fixes/${id}.png`)
}

async function apiLogin(request, email, role, password = WORLD_PASSWORD) {
  const login = await request.post(`${API}/auth/login`, {
    data: { email, password, role },
  })
  expect(login.ok()).toBeTruthy()
  return (await login.json()).access_token
}

test.describe.configure({ mode: 'serial' })

test.describe('Auth UI fixes — sign-out + change-password eye', () => {
  test.setTimeout(120_000)

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
  })

  test.afterAll(() => {
    const lines = [
      '# Auth UI fixes screenshots',
      '',
      '| ID | Title | File |',
      '|----|-------|------|',
      ...INDEX.map((r) => `| ${r.id} | ${r.title} | ${r.file} |`),
      '',
    ]
    fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'))
  })

  test('AUTH01 sign out lands on login without credentials error', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(/\/app\/admin/)

    await page.getByRole('button', { name: /Account menu for/i }).click()
    await page.getByRole('button', { name: /^Sign out$/i }).click()

    await page.waitForURL(/\/login/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/Could not validate credentials/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Retry$/i })).toHaveCount(0)

    await snap(page, 'AUTH01-sign-out-clean-login', 'After Sign out — clean Sign in, no credentials flash')
  })

  test('AUTH02 change-password universal eye above title', async ({ page, request }) => {
    const adminTok = await apiLogin(request, 'admin@cogni.pk', 'admin')
    const depts = await (
      await request.get(`${API}/admin/departments`, {
        headers: { Authorization: `Bearer ${adminTok}` },
      })
    ).json()
    const deptId = (depts || [])[0]?.id
    expect(deptId).toBeTruthy()

    const stamp = Date.now()
    const email = `pwfix.${stamp}@cogni.pk`
    const create = await request.post(`${API}/admin/users`, {
      headers: { Authorization: `Bearer ${adminTok}` },
      data: {
        name: `PW Fix ${stamp}`,
        email,
        role: 'teacher',
        dept_id: deptId,
      },
    })
    expect(create.ok()).toBeTruthy()
    const created = await create.json()
    const tempPw = created.temporary_password
    expect(tempPw).toBeTruthy()

    await clearSession(page)
    await loginWithPassword(page, email, tempPw, 'teacher')
    await page.waitForURL(/\/change-password/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: /Change your password/i })).toBeVisible()

    const showBtn = page.getByRole('button', { name: /Show passwords/i })
    await expect(showBtn).toBeVisible()
    // Eye lives above the title — not inside Current password.
    await expect(page.locator('#cp-cur').locator('xpath=ancestor::div[contains(@class,"field")][1]//button')).toHaveCount(0)
    await expect(page.locator('.auth-card-tools button')).toHaveCount(1)

    await page.locator('#cp-cur').fill(tempPw)
    await page.locator('#cp-new').fill('New-Passw0rd!!')
    await page.locator('#cp-new2').fill('New-Passw0rd!!')

    await expect(page.locator('#cp-cur')).toHaveAttribute('type', 'password')
    await snap(page, 'AUTH02-change-pw-eye-above-hidden', 'Universal eye above title — passwords hidden')

    await showBtn.click()
    await expect(page.getByRole('button', { name: /Hide passwords/i })).toBeVisible()
    await expect(page.locator('#cp-cur')).toHaveAttribute('type', 'text')
    await expect(page.locator('#cp-new')).toHaveAttribute('type', 'text')
    await expect(page.locator('#cp-new2')).toHaveAttribute('type', 'text')
    // Still exactly one eye control (no double in-field icon).
    await expect(page.locator('.auth-card-tools button')).toHaveCount(1)
    await expect(page.locator('.pw .btn')).toHaveCount(0)

    await snap(page, 'AUTH02-change-pw-eye-above-shown', 'Universal eye toggled — all three fields visible, no double eye')
  })
})
