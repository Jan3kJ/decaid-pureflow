import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The ocr flavour in a real browser: `npm run e2e:ocr` builds it into dist-ocr/ and serves that
// build on the skin's port, at the design target of `npm run e2e`, against the mocked gateway.
// Its specs are e2e/*.ocr.ts, which `npm run e2e` does not run; `npm run e2e` runs the base flavour.
export default defineConfig({
  ...base,
  testMatch: '*.ocr.ts',
  outputDir: 'e2e/.results/ocr',
  webServer: {
    command: 'npm run build:ocr && npx vite preview --mode ocr',
    port: 24800,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
