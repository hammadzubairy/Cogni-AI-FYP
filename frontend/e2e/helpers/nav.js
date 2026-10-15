/** Sidebar items are <button>s, not links. Prefer goto for stability. */

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} label Exact nav label (Home, Users, Requests, …)
 */
export async function clickNav(page, label) {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: new RegExp(`^${label}\\b`, 'i') })
    .click()
}
