/**
 * Assert UI/API against docs/fr-proof/EXPECTED.md checks.
 * Waits until loading labels disappear before screenshots.
 */
import { chromium } from '../../frontend/node_modules/playwright/index.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'screenshots')
const BASE = process.env.PROOF_BASE || 'http://127.0.0.1:5173'
const API = process.env.PROOF_API || 'http://127.0.0.1:8000'
const TEACHER = { email: 'ayesha.khan@umt.edu.pk', password: 'Test-Passw0rd!' }
const STUDENT = { email: 'hamza.ali@umt.edu.pk', password: 'Test-Passw0rd!' }
const LOADING_RE =
  /Loading(\s+(dashboard|materials|exam|submission|results|class))?…|Loading\.\.\./i

fs.mkdirSync(SHOTS, { recursive: true })

const results = []
function check(id, ok, expected, actual) {
  results.push({ id, ok: !!ok, expected, actual: String(actual ?? '') })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${ok ? '' : actual}`)
}

async function apiLogin(user) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login ${r.status} ${JSON.stringify(j)}`)
  return j
}

async function api(token, method, urlPath, body, isForm = false) {
  const headers = { Authorization: `Bearer ${token}` }
  let payload
  if (isForm) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const r = await fetch(`${API}${urlPath}`, { method, headers, body: payload })
  const text = await r.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { status: r.status, json }
}

async function injectAuth(page, auth) {
  await page.goto(`${BASE}/login`)
  await page.evaluate((payload) => {
    localStorage.setItem('cogni-token', payload.access_token)
    if (payload.user) localStorage.setItem('cogni-user', JSON.stringify(payload.user))
  }, auth)
}

async function waitLoaded(page, { timeout = 45000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const text = await page.locator('body').innerText()
    if (!LOADING_RE.test(text)) return text
    await page.waitForTimeout(500)
  }
  const text = await page.locator('body').innerText()
  throw new Error(`Still loading after ${timeout}ms: ${text.slice(0, 200)}`)
}

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

function assertNoLoading(id, text) {
  const bad = LOADING_RE.test(text)
  check(id, !bad, 'No loading spinner/label', bad ? text.match(LOADING_RE)?.[0] : 'loaded')
  return !bad
}

async function main() {
  // --- E0 ---
  let health
  try {
    health = await fetch(`${API}/api/health`).then((r) => r.json())
  } catch (e) {
    health = { error: String(e) }
  }
  check('E0.1', health?.status === 'ok', '{"status":"ok"}', JSON.stringify(health))

  let fe
  try {
    fe = await fetch(BASE).then((r) => r.status)
  } catch (e) {
    fe = String(e)
  }
  check('E0.2', fe === 200, 'HTTP 200', fe)

  if (health?.status !== 'ok' || fe !== 200) {
    await writeReport()
    process.exit(1)
  }

  const teacherAuth = await apiLogin(TEACHER)
  const token = teacherAuth.access_token
  const classes = (await api(token, 'GET', '/api/classes')).json || []
  const cls = classes.find((c) => c.code === 'CS-201-A') || classes[0]
  check('E0.class', !!cls, 'CS-201-A exists', cls?.code)

  // Ensure materials exist (idempotent upload if missing)
  let mats = (await api(token, 'GET', `/api/classes/${cls.id}/materials`)).json || []
  const has = (name) => mats.some((m) => m.name === name)
  const pdfPath = path.join(__dirname, 'assets/fyp-report.pdf')
  const pptPath = path.join(__dirname, 'assets/devops-lecture1.pptx')

  if (!has('fyp-report.pdf') && fs.existsSync(pdfPath)) {
    const fd = new FormData()
    fd.append('file', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), 'fyp-report.pdf')
    fd.append('name', 'fyp-report.pdf')
    await api(token, 'POST', `/api/classes/${cls.id}/materials`, fd, true)
  }
  if (!has('devops-lecture1.pptx') && fs.existsSync(pptPath)) {
    const fd = new FormData()
    fd.append(
      'file',
      new Blob([fs.readFileSync(pptPath)], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
      'devops-lecture1.pptx',
    )
    fd.append('name', 'devops-lecture1.pptx')
    await api(token, 'POST', `/api/classes/${cls.id}/materials`, fd, true)
  }
  if (!has('Wikipedia Hash table')) {
    await api(token, 'POST', `/api/classes/${cls.id}/materials`, {
      url: 'https://en.wikipedia.org/wiki/Hash_table',
      name: 'Wikipedia Hash table',
    })
  }
  mats = (await api(token, 'GET', `/api/classes/${cls.id}/materials`)).json || []

  const pdf = mats.find((m) => m.name === 'fyp-report.pdf')
  const ppt = mats.find((m) => m.name === 'devops-lecture1.pptx')
  const urlMat = mats.find((m) => m.name === 'Wikipedia Hash table' || m.kind === 'url')

  check('E2.3.pdf', !!pdf, 'fyp-report.pdf in list', pdf?.name)
  check('E2.4', !!pdf && pdf.chunk_count >= 1 && pdf.word_count >= 1000, 'pdf chunks>=1 words>=1000', JSON.stringify(pdf))
  check('E2.3.pptx', !!ppt, 'devops-lecture1.pptx in list', ppt?.name)
  check('E2.5', !!ppt && ppt.kind === 'pptx' && ppt.chunk_count >= 1 && ppt.word_count >= 100, 'pptx ok', JSON.stringify(ppt))
  check('E2.3.url', !!urlMat, 'Wikipedia / url material', urlMat?.name)
  check(
    'E2.6',
    !!urlMat && urlMat.kind === 'url' && urlMat.chunk_count >= 1 && urlMat.word_count >= 300,
    'url kind/chunks/words',
    JSON.stringify(urlMat),
  )

  // Exam generate
  const matIds = [pdf, ppt, urlMat].filter(Boolean).map((m) => m.id)
  const gen = await api(token, 'POST', '/api/exams/generate', {
    class_id: cls.id,
    title: 'FR Expected Quiz',
    kind: 'Quiz',
    duration_min: 20,
    material_ids: matIds,
    counts: { MCQ: 3, Short: 2, Essay: 1 },
  })
  const exam = gen.json?.exam || gen.json
  const qCount = exam?.questions?.length || 0
  check('E4.1', gen.status < 300 && qCount === 6, '6 questions', `status=${gen.status} q=${qCount}`)
  let examId = exam?.id
  if (examId) {
    const pub = await api(token, 'POST', `/api/exams/${examId}/publish`)
    check('E4.2', pub.status < 300, 'published', pub.status)
  } else {
    check('E4.2', false, 'published', 'no exam id')
  }

  // Student attempt
  const st = await apiLogin(STUDENT)
  let attemptId = null
  if (examId) {
    const start = await api(st.access_token, 'POST', `/api/exams/${examId}/attempts`)
    attemptId = start.json?.id
    const full = await api(token, 'GET', `/api/exams/${examId}`)
    const questions = full.json?.questions || []
    for (const q of questions) {
      let value
      if (q.type === 'MCQ') value = q.answer_index
      else {
        const kws = (q.keywords || []).flatMap((k) => k.variants || [])
        value = `In my own words: ${kws.join(' ')}. ${q.model_answer || ''}`
      }
      await api(st.access_token, 'PUT', `/api/attempts/${attemptId}/answers`, { qid: q.qid, value })
    }
    const submit = await api(st.access_token, 'POST', `/api/attempts/${attemptId}/submit`)
    check('E5.1', submit.status < 300, 'student submitted', submit.status)
    const detail = await api(token, 'GET', `/api/attempts/${attemptId}/detail`)
    const written = (detail.json?.questions || []).filter((q) => q.type !== 'MCQ')
    const allSim = written.every((q) => typeof q.result?.similarity === 'number')
    const allAi = written.every((q) => typeof q.result?.ai_probability === 'number')
    check('E5.2', allSim && allAi && written.length > 0, 'similarity + ai_probability on written', JSON.stringify(written.map((q) => ({ t: q.type, sim: q.result?.similarity, ai: q.result?.ai_probability }))))
  } else {
    check('E5.1', false, 'student submitted', 'no exam')
    check('E5.2', false, 'similarity + ai', 'no attempt')
  }

  // --- UI ---
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  page.setDefaultTimeout(45000)

  try {
    await injectAuth(page, teacherAuth)

    // E1 dashboard
    await page.goto(`${BASE}/app/teacher`)
    let text = await waitLoaded(page)
    check('E1.1', /\/app\/teacher\/?$/.test(page.url()), '/app/teacher', page.url())
    check('E1.2', /TEACHER PORTAL/i.test(text) && /Ayesha/i.test(text), 'portal + Ayesha', text.slice(0, 120))
    const dashOk =
      /GOOD (MORNING|AFTERNOON|EVENING)/i.test(text) ||
      /Needs you|Your classes|Data Structures|Create/i.test(text)
    check('E1.3', dashOk && !LOADING_RE.test(text), 'dashboard content visible', text.slice(0, 250))
    await shot(page, 'ui-01-dashboard.png')
    assertNoLoading('E1.4', text)

    // E2 materials
    await page.goto(`${BASE}/app/teacher/materials`)
    text = await waitLoaded(page)
    check('E2.1', /Course material/i.test(text), 'Course material heading', text.slice(0, 100))
    check(
      'E2.2',
      /Files/i.test(text) && /Paste notes/i.test(text) && /Web link/i.test(text),
      'three source tabs',
      text.includes('Web link') ? 'tabs present' : text.slice(0, 200),
    )
    check('E2.3.ui', /fyp-report\.pdf/i.test(text) && /devops-lecture1\.pptx/i.test(text) && /Hash table|Web page/i.test(text), 'three materials visible', 'see text')
    await shot(page, 'ui-02-materials-list.png')
    assertNoLoading('E2.7.list', text)

    await page.locator('button', { hasText: 'Web link' }).click()
    text = await waitLoaded(page)
    check('E3.1', /Page URL/i.test(text) && /Name/i.test(text), 'URL fields', text.slice(0, 200))
    check('E3.2', /Process material/i.test(text), 'Process material button', /Process material/i.test(text))
    await shot(page, 'ui-03-url-tab.png')
    assertNoLoading('E2.7.url', text)

    await page.locator('button', { hasText: 'Files' }).click()
    text = await waitLoaded(page)
    check('E2.files', /PDF, DOCX, or PPTX|Choose PDF/i.test(text), 'files dropzone', text.slice(0, 150))
    await shot(page, 'ui-04-files-tab.png')
    assertNoLoading('E2.7.files', text)

    // E6 class
    await page.goto(`${BASE}/app/teacher/classes/${cls.id}`)
    text = await waitLoaded(page)
    check('E6.1', /CS-201-A/i.test(text) && !LOADING_RE.test(text), 'class detail loaded', text.slice(0, 200))
    await shot(page, 'ui-08-class-detail.png')
    assertNoLoading('E6.2', text)

    // E4 exam UI
    if (examId) {
      await page.goto(`${BASE}/app/teacher/exams/${examId}`)
      text = await waitLoaded(page)
      const examOk = /FR Expected Quiz|AI DRAFT|MCQ|Short|Essay/i.test(text)
      check('E4.3', examOk && !LOADING_RE.test(text), 'exam questions visible', text.slice(0, 250))
      await shot(page, 'ui-05-exam-paper.png')
      assertNoLoading('E4.4', text)
    } else {
      check('E4.3', false, 'exam UI', 'no examId')
      check('E4.4', false, 'screenshot', 'skipped')
    }

    // E5 attempt review
    if (attemptId) {
      await page.goto(`${BASE}/app/teacher/attempts/${attemptId}`)
      text = await waitLoaded(page)
      const gradeOk =
        /Semantic similarity|similarity|AI-writing|AI writing|likelihood/i.test(text) ||
        /\d+\s*%/.test(text)
      check('E5.3', gradeOk && !LOADING_RE.test(text) && !/Page not found/i.test(text), 'grading UI visible', text.slice(0, 300))
      await shot(page, 'ui-06-attempt-review.png')
      assertNoLoading('E5.4', text)

      await page.goto(`${BASE}/app/teacher/exams/${examId}/results`)
      text = await waitLoaded(page)
      const resOk = /Hamza|submitted|Results|total|score/i.test(text)
      check('E5.5', resOk && !LOADING_RE.test(text), 'results page loaded', text.slice(0, 250))
      await shot(page, 'ui-07-results.png')
      assertNoLoading('E5.5.shot', text)
    } else {
      check('E5.3', false, 'grading UI', 'no attempt')
      check('E5.4', false, 'screenshot', 'skipped')
      check('E5.5', false, 'results', 'skipped')
    }
  } finally {
    await browser.close()
  }

  await writeReport()
  const failed = results.filter((r) => !r.ok)
  process.exitCode = failed.length ? 1 : 0
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`)
}

async function writeReport() {
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  const lines = [
    '# FR proof — actual vs expected',
    '',
    `Run at: ${new Date().toISOString()}`,
    `Score: **${passed}/${results.length}** checks passed`,
    '',
    failed.length ? `## Failed (${failed.length})` : '## Failed',
    '',
  ]
  if (!failed.length) lines.push('_None — all expected checks met._', '')
  else {
    lines.push('| ID | Expected | Actual |', '|----|----------|--------|')
    for (const f of failed) {
      lines.push(`| ${f.id} | ${esc(f.expected)} | ${esc(f.actual).slice(0, 180)} |`)
    }
    lines.push('')
  }
  lines.push('## All checks', '', '| ID | Result | Expected | Actual |', '|----|--------|----------|--------|')
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.ok ? 'PASS' : 'FAIL'} | ${esc(r.expected)} | ${esc(r.actual).slice(0, 120)} |`)
  }
  lines.push('', '## Screenshots required', '')
  for (const name of [
    'ui-01-dashboard.png',
    'ui-02-materials-list.png',
    'ui-03-url-tab.png',
    'ui-04-files-tab.png',
    'ui-05-exam-paper.png',
    'ui-06-attempt-review.png',
    'ui-07-results.png',
    'ui-08-class-detail.png',
  ]) {
    const p = path.join(SHOTS, name)
    const exists = fs.existsSync(p)
    lines.push(`- ${exists ? 'OK' : 'MISSING'} \`${name}\`${exists ? ` (${fs.statSync(p).size} bytes)` : ''}`)
  }
  lines.push('')
  const out = path.join(__dirname, 'ACTUAL.md')
  fs.writeFileSync(out, lines.join('\n'))
  fs.writeFileSync(path.join(__dirname, 'actual.json'), JSON.stringify({ passed, total: results.length, results }, null, 2))
  console.log('Wrote', out)
}

function esc(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

main().catch(async (err) => {
  console.error(err)
  results.push({ id: 'RUN', ok: false, expected: 'clean run', actual: String(err) })
  await writeReport()
  process.exit(1)
})
