import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /platform-skill-market\.spec\.ts/,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:1430',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        'npm --workspace @suit-skills/server run build && node packages/server/dist/index.js',
      env: {
        PLATFORM_AUTH_MODE: 'none',
        PLATFORM_API_HOST: '127.0.0.1',
        PLATFORM_WEB_APP_URL: 'http://127.0.0.1:1430',
      },
      url: 'http://127.0.0.1:4591/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        'npm --workspace @suit-skills/app-platform-web run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:1430',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
