import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the stack started with `docker compose up --build` (web, API, Mailpit), which uses the
 * real Fake Store. CI adds `e2e/docker-compose.stub.yml` to swap in a recorded copy, because Fake Store
 * blocks cloud runners (DECISIONS.md D14). Override the URLs to point at another environment.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
