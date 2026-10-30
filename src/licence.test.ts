import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';
import pkg from '../package.json';

// One licence statement everywhere.
const ROOT = join(import.meta.dirname, '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const SPDX = 'GPL-3.0-only';

// The GNU General Public License, version 3, as the FSF publishes it (gpl-3.0.txt, 35147 bytes).
const GPL3_SHA256 = '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903';

const STREAMLINE_COPYRIGHT = 'Copyright (C) 2025-2026 Decent Espresso';
const STREAMLINE_LICENCE = 'Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.';

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|svelte)$/.test(entry.name) ? [relative(ROOT, path).replaceAll('\\', '/')] : [];
  });
}

const ported = sourceFiles('src').filter((file) => /Ported (in part )?from Streamline\.js/.test(read(file)));

describe('licence', () => {
  it('LICENSE is the GPL-3.0 text, byte for byte', () => {
    const text = readFileSync(join(ROOT, 'LICENSE'));
    expect(createHash('sha256').update(text).digest('hex')).toBe(GPL3_SHA256);
  });

  it('package.json, the manifest, README and NOTICE name the same licence', () => {
    expect(pkg.license).toBe(SPDX);
    // Decaid's manifest has no licence field; if one is added, it says the same.
    expect((manifest as { license?: string }).license ?? SPDX).toBe(SPDX);
    expect(read('README.md')).toContain(`\`${SPDX}\``);
    expect(read('README.md')).toContain('[LICENSE](LICENSE)');
    expect(read('NOTICE')).toContain(`SPDX: ${SPDX}`);
  });

  it('calls Streamline GPL-3.0-or-later, as its LICENSE.txt does, and nowhere ISC', () => {
    expect(read('README.md')).not.toMatch(/\bISC\b/);
    expect(read('NOTICE')).toContain('(GPL-3.0-or-later)');
  });

  it('every ported file carries Streamline’s notice, and NOTICE lists exactly those files', () => {
    expect(ported.length).toBeGreaterThan(0);
    for (const file of ported) {
      const head = read(file).split('\n').slice(0, 10).join('\n');
      expect(head, file).toContain(STREAMLINE_COPYRIGHT);
      expect(head, file).toContain(STREAMLINE_LICENCE);
      expect(head, file).toMatch(/streamline-js\), v0\.2\.\d+/);
    }
    const listed = [...read('NOTICE').matchAll(/^ {5}(src\/\S+)$/gm)].map((match) => match[1]);
    expect([...listed].sort()).toEqual([...ported].sort());
  });

  it("the ocr ZIP's copy of NOTICE adds the reading's parts and their licence; the repository's NOTICE does not", async () => {
    const { MODELS, NOTICE_SECTION } = await import('../scripts/fetch-ocr-models.mjs');
    expect(NOTICE_SECTION).toContain('Apache License, Version 2.0 (Apache-2.0)');
    expect(NOTICE_SECTION).toContain('https://github.com/PaddlePaddle/PaddleOCR');
    for (const model of MODELS) {
      expect(NOTICE_SECTION).toContain(model.name);
      expect(read('NOTICE')).not.toContain(model.name);
    }
    expect(read('NOTICE')).not.toMatch(/PP-OCR|PaddleOCR/);
    // The section's number follows the last of NOTICE.
    const last = Math.max(...[...read('NOTICE').matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1])));
    expect(NOTICE_SECTION).toMatch(new RegExp(`^\\n\\n${last + 1}\\. `));
  });

  it("the reading's packages carry an allowed licence and the ocr ZIP's NOTICE names each", async () => {
    const { OCR_LICENCES, OCR_PACKAGES, NOTICE_SECTION } = await import('../scripts/fetch-ocr-models.mjs');
    // The licences the reading may bring in: free, open source, no registration.
    expect(Object.keys(OCR_LICENCES).sort()).toEqual(['Apache-2.0', 'BSL', 'MIT']);
    const packageOf = (name: string) =>
      JSON.parse(read(`node_modules/${name}/package.json`)) as { license: string; dependencies?: Record<string, string> };
    for (const entry of OCR_PACKAGES) {
      expect(packageOf(entry.name).license, entry.name).toBe(entry.licence);
      expect(NOTICE_SECTION).toContain(`${entry.name}, ${entry.by}, ${entry.url}\n       ${OCR_LICENCES[entry.licence]}`);
    }
    // Every package the reader's SDK needs at run time is listed.
    const sdk = OCR_PACKAGES[0].name;
    expect(Object.keys(packageOf(sdk).dependencies ?? {}).sort()).toEqual(
      OCR_PACKAGES.slice(1)
        .map((entry) => entry.name)
        .sort(),
    );
    // Only for building: the reading is bundled into the ocr build, never installed with the skin.
    expect(Object.keys((pkg as { dependencies?: object }).dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.devDependencies)).toContain(sdk);
  });

  it('NOTICE and README credit D-Flow and DSx2', () => {
    for (const file of ['NOTICE', 'README.md']) {
      expect(read(file), file).toContain('D-Flow');
      expect(read(file), file).toContain('Damian Brakel');
      expect(read(file), file).toContain('https://github.com/Damian-AU/DSx2');
      expect(read(file), file).toContain('Jan3kJ/A_Flow');
    }
    expect(read('NOTICE')).toContain('Many ideas are inspired by DSx2');
  });
});
