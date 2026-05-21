import { defineConfig, devices } from '@playwright/test';

const platformWebPort = Number(process.env.PLAYWRIGHT_PLATFORM_WEB_PORT ?? 11430);
const platformApiPort = Number(process.env.PLAYWRIGHT_PLATFORM_API_PORT ?? 14591);
const platformWebUrl = `http://127.0.0.1:${platformWebPort}`;
const platformApiUrl = `http://127.0.0.1:${platformApiPort}`;
const platformDataRoot = 'test-results/platform-api-data';

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
    baseURL: platformWebUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        'npm --workspace @suit-skills/server run build && node packages/server/dist/index.js',
      env: {
        PLATFORM_AUTH_MODE: 'none',
        PLATFORM_API_HOST: '127.0.0.1',
        PLATFORM_API_PORT: String(platformApiPort),
        PLATFORM_WEB_APP_URL: platformWebUrl,
        PLATFORM_API_PUBLIC_URL: platformApiUrl,
        PLATFORM_API_DATA_FILE: `${platformDataRoot}/evaluations.json`,
        PLATFORM_API_SKILLS_FILE: `${platformDataRoot}/skills.json`,
        PLATFORM_API_GIT_CONFIG_FILE: `${platformDataRoot}/git-config.json`,
        PLATFORM_API_SOURCES_FILE: `${platformDataRoot}/sources.json`,
        PLATFORM_API_UPLOADS_FILE: `${platformDataRoot}/uploads.json`,
        PLATFORM_API_UPLOAD_DIR: `${platformDataRoot}/uploads`,
      },
      url: `${platformApiUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        `npm --workspace @suit-skills/app-platform-web run dev -- --host 127.0.0.1 --port ${platformWebPort} --strictPort`,
      env: {
        SUIT_SKILLS_PLATFORM_API_URL: platformApiUrl,
        VITE_PLATFORM_API_BASE_URL: '',
      },
      url: platformWebUrl,
      reuseExistingServer: false,
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
