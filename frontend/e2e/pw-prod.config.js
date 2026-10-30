import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  testMatch: 'llm-gen-prod.spec.js',
  timeout: 180000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'https://frontend-six-vert-62.vercel.app',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
