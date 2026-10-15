import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../backend')
const venvUvicorn = path.join(backendDir, '.venv/bin/uvicorn')

const MONGO_DB = process.env.PLAYWRIGHT_MONGO_DB || 'cogni_playwright'
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'mock'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Shared seeded DB — one worker avoids cross-spec races; retries inflate runtime.
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Quote path — workspace dir may contain spaces ("Hammad Fyp")
      command: `"${venvUvicorn}" app.main:app --host 127.0.0.1 --port 8000`,
      cwd: backendDir,
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENV: 'test',
        JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-jwt-secret-32chars!!',
        MONGO_DB,
        // Prefer caller/env (.env) so real Groq/OpenAI can be used; default mock.
        LLM_PROVIDER,
        LLM_MODEL: process.env.LLM_MODEL || '',
        LLM_API_KEY: process.env.LLM_API_KEY || '',
        LLM_BASE_URL: process.env.LLM_BASE_URL || '',
        // Portal smokes + full-loop each call /auth/login; production cap is 10/min.
        LOGIN_RATE_LIMIT_MAX: '10000',
        LLM_RATE_LIMIT_MAX: '10000',
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
