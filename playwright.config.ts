import { defineConfig } from '@playwright/test';

// The editor in a real browser, on the design target: the target tablet has
// 2560 x 1600 physical pixels, that is 1280 x 800 CSS pixels at device scale factor 2, landscape.
// The skin's own dev port; 3000, 4001 and 8080 are never used.
const PORT = 24800;
// On GitHub (`CI` is set there): each failure is an annotation on the run's page as well, and a
// failed test keeps its trace in `e2e/.results/`, the job's artifact. No retry: a
// test that fails now and then is found and fixed.
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  reporter: CI ? [['list'], ['github']] : 'list',
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    colorScheme: 'dark',
    trace: CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'tablet',
      use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: PORT,
    reuseExistingServer: false,
  },
});
