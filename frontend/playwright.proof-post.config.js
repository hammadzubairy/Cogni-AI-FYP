import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../backend')
const venvUvicorn = path.join(backendDir, '.venv/bin/uvicorn')
const MONGO_DB = process.env.PLAYWRIGHT_MONGO_DB || 'cogni_playwright'

/**
 * Post-PR proof screenshots: seed + start servers (or reuse if already up).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/proof-post-pr.spec.js',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.js',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${venvUvicorn}" app.main:app --host 127.0.0.1 --port 8000`,
      cwd: backendDir,
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENV: 'test',
        JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-jwt-secret-32chars!!',
        MONGO_DB,
        // Force mock so practice-question formatting is deterministic for proof shots.
        LLM_PROVIDER: 'mock',
        LLM_API_KEY: '',
        LLM_BASE_URL: '',
        LOGIN_RATE_LIMIT_MAX: '10000',
        LLM_RATE_LIMIT_MAX: '10000',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: __dirname,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
