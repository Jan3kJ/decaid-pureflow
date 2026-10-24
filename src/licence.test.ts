import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';
import pkg from '../package.json';

// One licence statement everywhere (spec 3.13 item 1, acceptance 80).
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
