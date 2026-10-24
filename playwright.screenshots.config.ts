import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The pictures of the user documentation (spec 3.13): `npm run screenshots` runs
// e2e/user-docs.shots.ts on the mock gateway, at the design target of `npm run e2e`, and writes
// them into docs/user/img/. `npm run e2e` does not run it.
export default defineConfig({
  ...base,
  testMatch: '*.shots.ts',
  outputDir: 'e2e/.results/shots',
  // Dates in the pictures read the same on every machine.
  use: { ...base.use, locale: 'en-US', timezoneId: 'UTC' },
});
