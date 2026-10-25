import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// `npm run type-sizes`: e2e/type-sizes.sizes.ts lists every text's size per screen on the mock
// gateway, at the design target of `npm run e2e`, which does not run it.
export default defineConfig({
  ...base,
  testMatch: '*.sizes.ts',
  outputDir: 'e2e/.results/sizes',
  use: { ...base.use, actionTimeout: 10_000 },
});
