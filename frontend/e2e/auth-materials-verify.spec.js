/**
 * Verify materials dropzone spacing + HOD auth/permission fixes.
 * Screenshots → errors/verified/
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../../errors/verified')

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${id}.png`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: file, fullPage: true })
  // eslint-disable-next-line no-console
  console.log(`[${id}] ${title} → errors/verified/${id}.png`)
}

test.describe.configure({ mode: 'serial' })

test.describe('Auth + materials UI verify', () => {
  test.setTimeout(120_000)

  test('M1 materials Process button clears dropzone border', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: 'Course material', exact: true })).toBeVisible({
      timeout: 20_000,
    })
    if (await page.locator('#mat-cls').count()) {
      const opts = await page.locator('#mat-cls option').allTextContents()
      const idx = opts.findIndex((t) => /CS-201-A/i.test(t))
      if (idx >= 0) await page.locator('#mat-cls').selectOption({ index: idx })
    }
    await page.getByRole('button', { name: 'Files', exact: true }).click()

    const drop = page.locator('label.drop').first()
    const btn = page.getByRole('button', { name: 'Process material', exact: true })
    await expect(drop).toBeVisible()
    await expect(btn).toBeVisible()

    const gap = await page.evaluate(() => {
      const d = document.querySelector('label.drop')
      const b = [...document.querySelectorAll('button')].find((el) =>
        /Process material/i.test(el.textContent || ''),
      )
      if (!d || !b) return null
      const dr = d.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return {
        dropBottom: dr.bottom,
        btnTop: br.top,
        gap: br.top - dr.bottom,
        dropMarginBottom: getComputedStyle(d).marginBottom,
      }
    })

    expect(gap).toBeTruthy()
    expect(gap.gap).toBeGreaterThanOrEqual(10)
    expect(parseFloat(gap.dropMarginBottom)).toBeGreaterThanOrEqual(10)

    await snap(page, 'M1-materials-process-gap', 'Process material clears dropzone')
  })

  test('A1 HOD Department analytics loads without permission error', async ({ page }) => {
    await loginAs(page, 'hod')
    await page.goto('/app/hod/analytics')
    await expect(page.getByRole('heading', { name: /Department/i }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(/You do not have permission/i)).toHaveCount(0)
    await expect(page.getByText(/Could not validate credentials/i)).toHaveCount(0)
    // Still on HOD portal — not bounced to login
    await expect(page).toHaveURL(/\/app\/hod\/analytics/)
    await expect(page.getByText(/HOD PORTAL|Head of Department/i).first()).toBeVisible()
    await snap(page, 'A1-hod-analytics-ok', 'HOD analytics loads without permission banner')
  })

  test('A2 demoted HOD JWT is invalidated (401 not sticky 403)', async ({ request }) => {
    const login = await request.post('http://127.0.0.1:8000/api/auth/login', {
      data: { email: 'tariq.mehmood@umt.edu.pk', password: 'Test-Passw0rd!' , role: 'hod' },
    })
    expect(login.ok()).toBeTruthy()
    const oldToken = (await login.json()).access_token
    const oldHeaders = { Authorization: `Bearer ${oldToken}` }

    const before = await request.get('http://127.0.0.1:8000/api/hod/analytics', {
      headers: oldHeaders,
    })
    expect(before.status()).toBe(200)

    const adminLogin = await request.post('http://127.0.0.1:8000/api/auth/login', {
      data: { email: 'admin@cogni.pk', password: 'Test-Passw0rd!' , role: 'admin' },
    })
    const adminToken = (await adminLogin.json()).access_token
    const adminHeaders = { Authorization: `Bearer ${adminToken}` }

    const depts = await (await request.get('http://127.0.0.1:8000/api/admin/departments', {
      headers: adminHeaders,
    })).json()
    const cs = depts.find((d) => d.code === 'CS')
    expect(cs?.id).toBeTruthy()

    const users = await (await request.get('http://127.0.0.1:8000/api/admin/users', {
      headers: adminHeaders,
      params: { role: 'teacher' },
    })).json()
    const teacher = users.find((u) => u.dept_id === cs.id)
    expect(teacher?.id).toBeTruthy()

    const patch = await request.patch(`http://127.0.0.1:8000/api/admin/departments/${cs.id}`, {
      headers: adminHeaders,
      data: { hod_id: teacher.id },
    })
    expect(patch.ok()).toBeTruthy()

    const after = await request.get('http://127.0.0.1:8000/api/hod/analytics', {
      headers: oldHeaders,
    })
    expect(after.status()).toBe(401)

    // Restore original HOD so later tests / seed stay usable
    await request.patch(`http://127.0.0.1:8000/api/admin/departments/${cs.id}`, {
      headers: adminHeaders,
      data: { hod_id: cs.hod_id },
    })
  })

  test('A3 HOD can navigate between pages without forced re-login', async ({ page }) => {
    await loginAs(page, 'hod')
    await page.goto('/app/hod')
    await expect(page).toHaveURL(/\/app\/hod/)

    const nav = page.getByRole('navigation', { name: /Head of Department/i })
    await nav.getByRole('button', { name: 'Department', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/hod\/analytics/)
    await expect(page.getByText(/You do not have permission/i)).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/login/)

    await nav.getByRole('button', { name: /^Approvals/i }).click()
    await expect(page).toHaveURL(/\/app\/hod\/approvals/)
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText(/You do not have permission/i)).toHaveCount(0)

    await nav.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/hod\/?$/)
    await expect(page).not.toHaveURL(/\/login/)

    await snap(page, 'A3-hod-nav-no-relogin', 'HOD nav without forced re-login')
  })
})
