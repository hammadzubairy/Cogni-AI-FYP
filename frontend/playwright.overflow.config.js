import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../backend')
const venvUvicorn = path.join(backendDir, '.venv/bin/uvicorn')

const MONGO_DB = process.env.PLAYWRIGHT_MONGO_DB || 'cogni_playwright'
const FE_PORT = 5180
// Keep backend on 8000 — vite.config.js proxies /api → localhost:8000.
const BE_PORT = 8000

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/overflow-fix.spec.js'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.js',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${FE_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${venvUvicorn}" app.main:app --host 127.0.0.1 --port ${BE_PORT}`,
      cwd: backendDir,
      url: `http://127.0.0.1:${BE_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENV: 'test',
        JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-jwt-secret-32chars!!',
        MONGO_DB,
        LLM_PROVIDER: 'mock',
        LOGIN_RATE_LIMIT_MAX: '10000',
        LLM_RATE_LIMIT_MAX: '10000',
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${FE_PORT}`,
      cwd: __dirname,
      url: `http://127.0.0.1:${FE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        // Vite proxy defaults to 8000; point at our BE port via env if supported.
      },
    },
  ],
})
