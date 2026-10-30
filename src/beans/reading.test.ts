import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The flag of the two builds: readPhoto calls the reader only where `__OCR__` is true, and a base
// build holds no reader chunk (scripts/zip.mjs checks the ocr build has it).

const readBag = vi.fn(() => Promise.resolve([{ text: 'ABDUL', score: 0.9, box: { x: 0, y: 0, width: 10, height: 4 } }]));
vi.mock('./read', () => ({ readBag }));

afterEach(() => {
  vi.unstubAllGlobals();
  readBag.mockClear();
});

describe('readPhoto', () => {
  it('reads nothing in the base flavour', async () => {
    vi.stubGlobal('__OCR__', false);
    const { readPhoto } = await import('./reading');
    expect(await readPhoto('data:image/jpeg;base64,')).toEqual([]);
    expect(readBag).not.toHaveBeenCalled();
  });

  it('calls the reader with the photo in the ocr flavour', async () => {
    vi.stubGlobal('__OCR__', true);
    const { readPhoto } = await import('./reading');
    expect(await readPhoto('data:image/jpeg;base64,')).toHaveLength(1);
    expect(readBag).toHaveBeenCalledWith('data:image/jpeg;base64,');
  });

  it('the stub reader reads no line', async () => {
    const { readBag: stub } = await vi.importActual<typeof import('./read')>('./read');
    expect(await stub('data:image/jpeg;base64,')).toEqual([]);
  });

  it('the base build holds no reader chunk and no import of it', () => {
    const root = join(import.meta.dirname, '..', '..');
    const out = mkdtempSync(join(tmpdir(), 'base-build-'));
    try {
      const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
      const build = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(build.status, build.stderr).toBe(0);
      const assets = readdirSync(join(out, 'assets'));
      expect(assets.filter((name) => name.startsWith('read-'))).toEqual([]);
      for (const name of assets.filter((file) => file.endsWith('.js'))) {
        expect(readFileSync(join(out, 'assets', name), 'utf8'), name).not.toMatch(/read-[\w-]+\.js|readBag/);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
