import { defineConfig, devices } from '@playwright/test';

// BASE_URL : par défaut prod, override en env pour tester preview ou local.
//   BASE_URL=http://localhost:3000 npm test
//   BASE_URL=https://dda-coach-git-<branch>-<team>.vercel.app npm test
const baseURL = process.env.BASE_URL || 'https://dda-coach.vercel.app';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
