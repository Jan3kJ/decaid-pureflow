// `npm run screenshots`: the pictures of the user documentation.
// Runs e2e/user-docs.shots.ts with Playwright on the mock gateway (playwright.screenshots.config.ts,
// 1280 x 800 CSS pixels at device scale factor 2, dark) and checks that it wrote exactly the
// planned eight into docs/user/img/, no more.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const IMG = 'docs/user/img';
const PLANNED = ['home-idle', 'home-shot', 'swipe-row', 'editor', 'steam', 'history', 'bean-pick', 'settings-skin'].map(
  (name) => `${name}.png`,
);

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const run = spawnSync(process.execPath, [cli, 'test', '--config', 'playwright.screenshots.config.ts'], { stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status ?? 1);

const written = readdirSync(IMG).sort();
const missing = PLANNED.filter((name) => !written.includes(name));
const extra = written.filter((name) => !PLANNED.includes(name));
if (missing.length || extra.length) {
  console.error(`${IMG}: missing ${missing.join(', ') || 'none'}; not planned ${extra.join(', ') || 'none'}`);
  process.exit(1);
}
console.log(`${IMG}: ${written.length} pictures`);
