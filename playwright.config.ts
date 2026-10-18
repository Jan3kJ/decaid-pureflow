import { defineConfig } from '@playwright/test';

// The editor in a real browser, on the design target (spec 3.1): the founder's tablet has
// 2560 x 1600 physical pixels, that is 1280 x 800 CSS pixels at device scale factor 2, landscape.
// The skin's own dev port; 3000, 4001 and 8080 are never used.
const PORT = 24800;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  reporter: 'list',
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    colorScheme: 'dark',
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
