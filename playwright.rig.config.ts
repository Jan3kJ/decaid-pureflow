import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The tests that need the running rig: Decaid 0.8.8 with device simulation, its gateway on
// http://localhost:8080 (docs/research.md 8.8). `npm run e2e:rig`; they skip themselves when
// the gateway does not answer. The skin is served by the dev server on its own port, as in
// `npm run e2e`, and calls the gateway across origins.
export default defineConfig({
  ...base,
  testDir: 'e2e-rig',
  outputDir: 'e2e-rig/.results',
  // The simulated shot of the test takes about 100 s.
  timeout: 300_000,
});
