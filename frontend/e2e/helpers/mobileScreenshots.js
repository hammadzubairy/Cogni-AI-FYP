import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const MOBILE_SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots/mobile')
export const MOBILE_VIEWPORT = { width: 390, height: 844 }

let counter = 0
/** @type {{ n: string, file: string, title: string }[]} */
const log = []

export function resetMobileScreenshots() {
  counter = 0
  log.length = 0
  fs.mkdirSync(MOBILE_SCREENSHOT_DIR, { recursive: true })
  for (const name of fs.readdirSync(MOBILE_SCREENSHOT_DIR)) {
    if (name.endsWith('.png') || name === 'INDEX.md') {
      fs.unlinkSync(path.join(MOBILE_SCREENSHOT_DIR, name))
    }
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} slug
 * @param {string} title
 */
export async function mobileSnap(page, slug, title) {
  counter += 1
  const n = String(counter).padStart(2, '0')
  const fileName = `M${n}-${slug}.png`
  const filePath = path.join(MOBILE_SCREENSHOT_DIR, fileName)
  await page.waitForTimeout(200)
  await page.screenshot({ path: filePath, fullPage: true })
  log.push({ n: `M${n}`, file: fileName, title })
  // eslint-disable-next-line no-console
  console.log(`[${`M${n}`}] ${title} → e2e/screenshots/mobile/${fileName}`)
  return `M${n}`
}

export function writeMobileScreenshotIndex() {
  const lines = [
    '# Mobile responsive screenshots (390×844)',
    '',
    'Captured by `e2e/mobile-responsive.spec.js`.',
    '',
    '| # | File | What it shows |',
    '| --- | --- | --- |',
    ...log.map((row) => `| ${row.n} | \`${row.file}\` | ${row.title} |`),
    '',
  ]
  fs.writeFileSync(path.join(MOBILE_SCREENSHOT_DIR, 'INDEX.md'), lines.join('\n'), 'utf8')
  return log
}

/**
 * Soft check: no element outside an intentional horizontal scroller should stick
 * past the viewport. Nested `.tbl-wrap` / overflow-x regions are allowed to be wider.
 */
export async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const vw = window.innerWidth
    const offenders = []
    const all = document.body ? document.body.querySelectorAll('*') : []
    for (const el of all) {
      if (!(el instanceof HTMLElement)) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      // Skip known drawers / decorative layers.
      if (
        el.classList.contains('sidebar') ||
        el.classList.contains('scrim') ||
        el.classList.contains('lglow') ||
        el.classList.contains('stamp') ||
        style.position === 'fixed'
      ) {
        continue
      }
      // Inside an intentional scroll/clip port (not html/body) → OK.
      let contained = false
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        const ps = getComputedStyle(p)
        if (
          p.classList.contains('tbl-wrap') ||
          p.classList.contains('lhero') ||
          ps.overflowX === 'auto' ||
          ps.overflowX === 'scroll' ||
          ps.overflowX === 'hidden' ||
          ps.overflowX === 'clip' ||
          ps.overflow === 'hidden' ||
          ps.overflow === 'auto' ||
          ps.overflow === 'scroll'
        ) {
          contained = true
          break
        }
      }
      if (contained) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      // Past the right edge of the viewport (8px slack).
      if (rect.right > vw + 8) {
        const tag = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
          el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
            : ''
        }`
        offenders.push({ tag, right: Math.round(rect.right), width: Math.round(rect.width) })
        if (offenders.length >= 5) break
      }
    }
    const root = document.scrollingElement || document.documentElement
    return {
      ok: offenders.length === 0,
      offenders,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      innerWidth: vw,
    }
  })
  return overflow
}
