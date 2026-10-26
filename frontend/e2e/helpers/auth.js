/** Fixture-world accounts from tests/support/world.py */
export const ACCOUNTS = {
  admin: {
    email: 'admin@cogni.pk',
    role: 'admin',
    roleLabel: 'Admin',
    home: '/app/admin',
  },
  hod: {
    email: 'tariq.mehmood@umt.edu.pk',
    role: 'hod',
    roleLabel: 'Head of Department',
    home: '/app/hod',
  },
  teacher: {
    email: 'ayesha.khan@umt.edu.pk',
    role: 'teacher',
    roleLabel: 'Teacher',
    home: '/app/teacher',
  },
  student: {
    email: 'hamza.ali@umt.edu.pk',
    role: 'student',
    roleLabel: 'Student',
    home: '/app/student',
  },
  /** Dual HOD+Teacher — same email as hod */
  hodTeacher: {
    email: 'tariq.mehmood@umt.edu.pk',
    role: 'teacher',
    roleLabel: 'Teacher',
    home: '/app/teacher',
  },
  /** Dual teacher+student */
  teacherStudent: {
    email: 'faisal.aziz@umt.edu.pk',
    role: 'student',
    roleLabel: 'Student',
    home: '/app/student',
  },
  teacherStudentAsTeacher: {
    email: 'faisal.aziz@umt.edu.pk',
    role: 'teacher',
    roleLabel: 'Teacher',
    home: '/app/teacher',
  },
}

/** @deprecated use ACCOUNTS */
export const DEMO = ACCOUNTS

export const WORLD_PASSWORD = 'Test-Passw0rd!'
/** @deprecated use WORLD_PASSWORD */
export const DEMO_PASSWORD = WORLD_PASSWORD

const PORTAL_OPTION = {
  admin: 'Admin',
  hod: 'Head of Department',
  teacher: 'Teacher',
  student: 'Student',
}

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
  // Empty DB redirects /login → /setup; accept either public auth screen.
  const signIn = page.getByRole('heading', { name: 'Sign in' })
  const setup = page.getByRole('heading', { name: /Create your institution/i })
  await signIn.or(setup).first().waitFor({ timeout: 20_000 })
}

/**
 * Sign in via email/password/portal on /login.
 * @param {import('@playwright/test').Page} page
 * @param {keyof typeof ACCOUNTS | string} role
 * @param {{ email?: string, portal?: string, password?: string, expectHome?: string|null, expectError?: boolean }} [opts]
 */
export async function loginAs(page, role, opts = {}) {
  const acct = ACCOUNTS[role]
  const email = opts.email || acct?.email
  const portal = opts.portal || acct?.role || role
  const password = opts.password || WORLD_PASSWORD
  const home = opts.expectHome !== undefined ? opts.expectHome : acct?.home
  if (!email) throw new Error(`Unknown role/account: ${role}`)

  await clearSession(page)
  await page.locator('#l-email').fill(email)
  await page.locator('#l-pw').fill(password)
  const portalSelect = page.locator('#l-portal')
  if (await portalSelect.count()) {
    const label = PORTAL_OPTION[portal] || portal
    await portalSelect.selectOption({ label }).catch(async () => {
      await portalSelect.selectOption(portal)
    })
  }
  await page.locator('#login-main').getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 15_000 })

  if (opts.expectError) {
    await page.locator('.err').waitFor({ state: 'visible', timeout: 15_000 })
    return
  }

  const rateLimited = page.getByText(/Too many requests/i)
  try {
    if (home) {
      await page.waitForURL((url) => url.pathname.startsWith(home), {
        timeout: 30_000,
      })
    }
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
 * Manual email/password/portal login.
 */
export async function loginWithPassword(page, email, password, portal = 'student') {
  await clearSession(page)
  await page.locator('#l-email').fill(email)
  await page.locator('#l-pw').fill(password)
  const portalSelect = page.locator('#l-portal')
  if (await portalSelect.count()) {
    const label = PORTAL_OPTION[portal] || portal
    await portalSelect.selectOption({ label }).catch(async () => {
      await portalSelect.selectOption(portal)
    })
  }
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
