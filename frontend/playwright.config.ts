import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
// Chrome matches the ZR-21 evidence. Set PW_CHANNEL=none to use Playwright's bundled Chromium.
const channel =
  process.env.PW_CHANNEL === 'none' ? undefined : (process.env.PW_CHANNEL ?? 'chrome');

/**
 * E2E runs against the real Compose stack through nginx so cookies, CSRF and sessions behave
 * exactly as in the browser. The app is not started here: `globalSetup` fails fast with an
 * actionable message when the stack is down.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL,
    channel,
    locale: 'pl-PL',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
