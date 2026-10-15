import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../backend')
const venvUvicorn = path.join(backendDir, '.venv/bin/uvicorn')

// Dedicated empty DB — do not reuse PLAYWRIGHT_MONGO_DB from seeded suites.
const MONGO_DB = process.env.FRESH_INSTALL_MONGO_DB || 'cogni_fresh'
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'mock'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/fresh-install.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/fresh-install-setup.js',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'fresh-install',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
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
        PLAYWRIGHT_MONGO_DB: MONGO_DB,
        LLM_PROVIDER,
        LLM_MODEL: process.env.LLM_MODEL || '',
        LLM_API_KEY: process.env.LLM_API_KEY || '',
        LLM_BASE_URL: process.env.LLM_BASE_URL || '',
        LOGIN_RATE_LIMIT_MAX: '10000',
        LLM_RATE_LIMIT_MAX: '10000',
        PUBLIC_BASE_URL: 'http://127.0.0.1:5173',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: __dirname,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
