/**
 * Empty Mongo DB for the fresh-install Playwright project (no fixture world).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../../backend')

export default async function globalSetup() {
  const dbName = process.env.FRESH_INSTALL_MONGO_DB || 'cogni_fresh'
  const env = {
    ...process.env,
    APP_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-jwt-secret-32chars!!',
    MONGO_DB: dbName,
    PLAYWRIGHT_MONGO_DB: dbName,
    LLM_PROVIDER: process.env.LLM_PROVIDER || 'mock',
  }

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

  const script = `
from pymongo import MongoClient
import os
uri = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017")
name = os.environ["MONGO_DB"]
c = MongoClient(uri)
c.drop_database(name)
print(f"[fresh-install] dropped database {name}")
c.close()
`
  console.log(`[fresh-install] Ensuring empty DB ${dbName} via ${python}…`)
  const result = spawnSync(python, ['-c', script], {
    cwd: backendDir,
    env,
    encoding: 'utf8',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    throw new Error(`Failed to drop ${dbName} (exit ${result.status})`)
  }
}
