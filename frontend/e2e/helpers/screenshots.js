import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots')

let counter = 0
/** @type {{ n: string, file: string, title: string }[]} */
const log = []

export function resetScreenshots() {
  counter = 0
  log.length = 0
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  for (const name of fs.readdirSync(SCREENSHOT_DIR)) {
    if (name.endsWith('.png') || name === 'INDEX.md') {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, name))
    }
  }
}

/**
 * Capture a full-page screenshot with a stable SS## prefix.
 * @param {import('@playwright/test').Page} page
 * @param {string} slug  kebab-case short name
 * @param {string} title human description for INDEX.md
 */
export async function snap(page, slug, title) {
  counter += 1
  const n = String(counter).padStart(2, '0')
  const fileName = `SS${n}-${slug}.png`
  const filePath = path.join(SCREENSHOT_DIR, fileName)
  await page.waitForTimeout(250)
  await page.screenshot({ path: filePath, fullPage: true })
  log.push({ n: `SS${n}`, file: fileName, title })
  // eslint-disable-next-line no-console
  console.log(`[${`SS${n}`}] ${title} → e2e/screenshots/${fileName}`)
  return `SS${n}`
}

export function writeScreenshotIndex() {
  const lines = [
    '# Playwright screenshot tour',
    '',
    'Captured by `e2e/app-tour-screenshots.spec.js`. Open files in order by SS#.',
    '',
    '| SS# | File | What it shows |',
    '| --- | --- | --- |',
    ...log.map((row) => `| ${row.n} | \`${row.file}\` | ${row.title} |`),
    '',
  ]
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'INDEX.md'), lines.join('\n'), 'utf8')
  return log
}
