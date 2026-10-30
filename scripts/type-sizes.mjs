// `npm run type-sizes [file]`: lists every text's computed size and weight per screen, grouped by
// the type role (one size per kind of text), on the mock gateway at the design target
// (e2e/type-sizes.sizes.ts). Prints the listing, and writes it to the file when one is given, so
// that a listing before a change can be set beside one after it. With `--shots <folder>` it also
// writes a picture of each screen there.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const at = args.indexOf('--shots');
const shots = at >= 0 ? resolve(args.splice(at, 2)[1]) : undefined;
const out = resolve(args[0] ?? 'e2e/.results/type-sizes.txt');
mkdirSync(resolve(out, '..'), { recursive: true });
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const run = spawnSync(process.execPath, [cli, 'test', '--config', 'playwright.sizes.config.ts'], {
  stdio: 'inherit',
  env: { ...process.env, TYPE_SIZES_OUT: out, ...(shots && { TYPE_SIZES_SHOTS: shots }) },
});
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(readFileSync(out, 'utf8'));
