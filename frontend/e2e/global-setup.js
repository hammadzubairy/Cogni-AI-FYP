/**
 * Reseed the dedicated Playwright Mongo DB before the suite runs.
 * Uses MONGO_DB=cogni_playwright with --force (name does not end in _dev/_demo).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../../backend')

export default async function globalSetup() {
  const env = {
    ...process.env,
    APP_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-jwt-secret-32chars!!',
    MONGO_DB: process.env.PLAYWRIGHT_MONGO_DB || 'cogni_playwright',
    LLM_PROVIDER: process.env.LLM_PROVIDER || 'mock',
  }

  // Prefer project venv python
  const pythonCandidates = [
    path.join(backendDir, '.venv/bin/python'),
    'python3',
    'python',
  ]

  let python = 'python3'
  for (const candidate of pythonCandidates) {
    if (candidate.includes('/')) {
      const check = spawnSync(candidate, ['-c', 'import sys'], { encoding: 'utf8' })
      if (check.status === 0) {
        python = candidate
        break
      }
    } else {
      python = candidate
      break
    }
  }

  console.log(`[e2e] Loading fixture world into ${env.MONGO_DB} via ${python} -m tests.support.world --force …`)
  const result = spawnSync(python, ['-m', 'tests.support.world', '--force'], {
    cwd: backendDir,
    env,
    encoding: 'utf8',
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status !== 0) {
    throw new Error(
      `Seed failed (exit ${result.status}). Ensure MongoDB is running and backend deps are installed.`,
    )
  }
  console.log('[e2e] Seed complete.')
}
