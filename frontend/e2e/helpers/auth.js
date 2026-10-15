/** Fixture-world accounts from tests/support/world.py */
export const ACCOUNTS = {
  admin: { email: 'admin@cogni.pk', roleLabel: 'Admin', home: '/app/admin' },
  hod: {
    email: 'tariq.mehmood@umt.edu.pk',
    roleLabel: 'HOD',
    home: '/app/hod',
  },
  teacher: {
    email: 'ayesha.khan@umt.edu.pk',
    roleLabel: 'Teacher',
    home: '/app/teacher',
  },
  student: {
    email: 'hamza.ali@umt.edu.pk',
    roleLabel: 'Student',
    home: '/app/student',
  },
}

/** @deprecated use ACCOUNTS */
export const DEMO = ACCOUNTS

export const WORLD_PASSWORD = 'Test-Passw0rd!'
/** @deprecated use WORLD_PASSWORD */
export const DEMO_PASSWORD = WORLD_PASSWORD

/**
 * Wipe JWT and land on a fresh login screen.
 */
export async function clearSession(page) {
  await page.goto('about:blank')
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.removeItem('cogni-token')
  })
  if (await page.getByRole('heading', { name: 'Sign in' }).count() === 0) {
    await page.evaluate(() => localStorage.removeItem('cogni-token'))
    await page.goto('/login')
  }
  await page.getByRole('heading', { name: 'Sign in' }).waitFor({ timeout: 20_000 })
}

/**
 * Sign in via email/password on /login.
 * @param {import('@playwright/test').Page} page
 * @param {'admin'|'hod'|'teacher'|'student'} role
 */
export async function loginAs(page, role) {
  const acct = ACCOUNTS[role]
  if (!acct) throw new Error(`Unknown role: ${role}`)

  await clearSession(page)
  await page.locator('#l-email').fill(acct.email)
  await page.locator('#l-pw').fill(WORLD_PASSWORD)
  await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 15_000 })

  const rateLimited = page.getByText(/Too many requests/i)
  try {
    await page.waitForURL((url) => url.pathname.startsWith(acct.home), {
      timeout: 30_000,
    })
  } catch (err) {
    if (await rateLimited.isVisible().catch(() => false)) {
      throw new Error(
        `Login rate-limited while signing in as ${role}. ` +
          'Ensure LOGIN_RATE_LIMIT_MAX is raised for Playwright (see playwright.config.js).',
      )
    }
    throw err
  }
}

/**
 * Manual email/password login.
 */
export async function loginWithPassword(page, email, password) {
  await clearSession(page)
  await page.locator('#l-email').fill(email)
  await page.locator('#l-pw').fill(password)
  await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click()
}

/**
 * @deprecated Demo switcher removed from AppShell.
 */
export async function switchDemo() {
  throw new Error('Demo account switcher was removed; sign out and loginAs instead.')
}

/**
 * Confirm the in-app modal (useConfirm / openModal).
 */
export async function confirmModal(page, okName) {
  const dialog = page.locator('#modal-box, .modal').first()
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: okName }).click()
}
