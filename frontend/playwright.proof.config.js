import { defineConfig, devices } from '@playwright/test'

/**
 * Proof-screenshot config: no globalSetup (DB already seeded), reuse running servers.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/proof-fixes.spec.js',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 420_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
