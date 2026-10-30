/**
 * Prove long filenames no longer overflow Study Assistant or Materials upload.
 * Screenshots → e2e/screenshots/overflow/
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loginAs } from './helpers/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, 'screenshots/overflow')

const LONG_PDF =
  'Simple_Microscope_vs_Electron_Microscope_Notes_Importance_and_Practical_Applications.pdf'

async function snap(page, id, title) {
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${id}.png`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: file, fullPage: true })
  // eslint-disable-next-line no-console
  console.log(`[${id}] ${title} → e2e/screenshots/overflow/${id}.png`)
}

test.describe.configure({ mode: 'serial' })

test.describe('Overflow / responsive filename fixes', () => {
  test.setTimeout(120_000)

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true })
  })

  test('OV1 study assistant — long names wrap/truncate inside chat + sidebar', async ({
    page,
  }) => {
    await loginAs(page, 'student')
    await page.goto('/app/student/study')
    await expect(page.getByRole('heading', { name: /Study assistant/i })).toBeVisible({
      timeout: 20_000,
    })

    // Force long names into the material list and greeting bubble.
    await page.evaluate((longName) => {
      document.querySelectorAll('.doc-name').forEach((el, i) => {
        el.textContent =
          i === 0
            ? longName
            : `Concave_and_Convex_Lenses_Geometrical_Optics_Very_Long_${i}.pdf`
        el.setAttribute('title', el.textContent)
      })
      const bubble = document.querySelector('.msg.a .msg-line, .msg.a')
      if (bubble) {
        const soft = longName.replace(/([_.\-])/g, '$1\u200b')
        const line = bubble.querySelector?.('.msg-line') || bubble
        line.textContent = `Hi. Ask me anything about "${soft}". I answer only from this material and show the page I used.`
      }
    }, LONG_PDF)

    const nameEl = page.locator('.doc-name').first()
    await expect(nameEl).toBeVisible()
    const nameBox = await nameEl.evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        textOverflow: cs.textOverflow,
        overflow: cs.overflow,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }
    })
    expect(nameBox.textOverflow).toBe('ellipsis')
    expect(nameBox.overflow).toMatch(/hidden/)
    expect(nameBox.scrollWidth).toBeGreaterThan(nameBox.clientWidth)

    const msg = page.locator('.msg.a').first()
    await expect(msg).toBeVisible()
    const overflow = await msg.evaluate((el) => {
      const parent = el.closest('.msgs') || el.parentElement
      const msgRect = el.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      return {
        overflowsParent: msgRect.right > parentRect.right + 1,
        wrap: getComputedStyle(el).overflowWrap,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
      }
    })
    expect(overflow.overflowsParent).toBe(false)
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 2)

    await snap(page, 'OV1-study-long-names', 'Study assistant — long names contained')

    // Narrow viewport: stack docs above chat, still no horizontal page scroll.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(200)
    const scroll = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(scroll.doc).toBeLessThanOrEqual(scroll.client + 2)
    await snap(page, 'OV1-study-mobile', 'Study assistant — mobile, no horizontal overflow')
  })

  test('OV2 materials upload — Remove stays clear of long filenames', async ({ page }) => {
    await loginAs(page, 'teacher')
    await page.goto('/app/teacher/materials')
    await expect(page.getByRole('heading', { name: /material/i }).first()).toBeVisible({
      timeout: 20_000,
    })

    const input = page.locator('input[type="file"]').first()
    await expect(input).toBeAttached()

    // Inject FileList via DataTransfer so React onChange sees long names.
    await input.evaluate((el, names) => {
      const dt = new DataTransfer()
      for (const name of names) {
        const blob = new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' })
        dt.items.add(new File([blob], name, { type: 'application/pdf' }))
      }
      el.files = dt.files
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, [
      'Importance_and_Practical_Applications_of_Hydrocarbons_Notes.pdf',
      'Types_of_Hydrocarbons_Alkanes_Alkenes_Alkynes_Notes.pdf',
      'Basics_of_Hydrocarbons_Notes.pdf',
    ])

    const rows = page.locator('.file-queue .lrow')
    await expect(rows).toHaveCount(3, { timeout: 10_000 })

    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i)
      const overlap = await row.evaluate((el) => {
        const name = el.querySelector('.grow b')
        const btn = el.querySelector('button')
        if (!name || !btn) return { ok: false, reason: 'missing' }
        const nr = name.getBoundingClientRect()
        const br = btn.getBoundingClientRect()
        const overlaps = nr.right > br.left + 1 && nr.left < br.right
        const cs = getComputedStyle(name)
        return {
          ok: !overlaps,
          overlaps,
          textOverflow: cs.textOverflow,
          nameRight: nr.right,
          btnLeft: br.left,
        }
      })
      expect(overlap.ok, `row ${i} name overlaps Remove`).toBe(true)
      expect(overlap.textOverflow).toBe('ellipsis')
    }

    await snap(page, 'OV2-materials-file-queue', 'Materials — long names truncate before Remove')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(200)
    const scroll = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(scroll.doc).toBeLessThanOrEqual(scroll.client + 2)
    await snap(page, 'OV2-materials-mobile', 'Materials upload — mobile, no overlap')
  })
})
