import { defineConfig } from '@playwright/test';

// The editor in a real browser, on the design target of 1280 x 800 (landscape).
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
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run dev',
    port: PORT,
    reuseExistingServer: false,
  },
});
