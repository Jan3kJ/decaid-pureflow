import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// scripts/serve-release.mjs on a fixture folder: index.json with sizes and sums, the CORS header,
// a ZIP sent as it is, and nothing outside the folder.

interface Zip {
  name: string;
  size: number;
  modified: string;
  sha256: string | null;
}
interface ServeRelease {
  PORT: number;
  listZips(dir: string): Zip[];
  fileName(pathname: string): string | null;
  makeServer(dir: string): Server;
  parseArgs(argv: string[]): { port: number; dir: string };
}

let serve: ServeRelease;
let root: string;
let dir: string;
let server: Server;
let origin: string;
const BASE = Buffer.from('the base ZIP, as a fixture');
const OCR = Buffer.from('the ocr ZIP, a little longer, as a fixture');
const sum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

beforeAll(async () => {
  serve = (await import(pathToFileURL(join(import.meta.dirname, '..', 'scripts', 'serve-release.mjs')).href)) as ServeRelease;
  root = mkdtempSync(join(tmpdir(), 'serve-release-'));
  dir = join(root, 'release');
  mkdirSync(join(dir, 'old'), { recursive: true });
  writeFileSync(join(dir, 'pureflow-0.9.0.zip'), BASE);
  writeFileSync(join(dir, 'pureflow-0.9.0-ocr.zip'), OCR);
  writeFileSync(join(dir, 'old', 'pureflow-0.8.0.zip'), BASE);
  writeFileSync(join(root, 'secret.zip'), BASE);
  // Only the base ZIP has its line.
  writeFileSync(join(dir, 'SHA256SUMS.txt'), `${sum(BASE)}  pureflow-0.9.0.zip\n`);
  utimesSync(join(dir, 'pureflow-0.9.0.zip'), new Date('2026-10-30T10:00:00Z'), new Date('2026-10-30T10:00:00Z'));
  utimesSync(join(dir, 'pureflow-0.9.0-ocr.zip'), new Date('2026-10-31T10:00:00Z'), new Date('2026-10-31T10:00:00Z'));
  server = serve.makeServer(dir);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

describe('serve-release', () => {
  it('serves on port 24810 by default, and takes --port and --dir', () => {
    expect(serve.PORT).toBe(24810);
    expect(serve.parseArgs([])).toEqual({ port: 24810, dir: 'release' });
    expect(serve.parseArgs(['--port', '24811', '--dir=out'])).toEqual({ port: 24811, dir: 'out' });
    expect(() => serve.parseArgs(['--port', 'x'])).toThrow('--port');
  });

  it('answers index.json with every ZIP of the folder, newest first, with its size and sum, to any origin', async () => {
    const response = await fetch(`${origin}/index.json`, { headers: { Origin: 'http://localhost:24800' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual([
      { name: 'pureflow-0.9.0-ocr.zip', size: OCR.length, modified: '2026-10-31T10:00:00.000Z', sha256: null },
      { name: 'pureflow-0.9.0.zip', size: BASE.length, modified: '2026-10-30T10:00:00.000Z', sha256: sum(BASE) },
    ]);
  });

  it('sends a ZIP of the folder as it is', async () => {
    const response = await fetch(`${origin}/pureflow-0.9.0.zip`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(BASE);
  });

  it('refuses a path out of the folder or into a subfolder, and any write', async () => {
    for (const path of [
      '/../secret.zip',
      '/%2e%2e/secret.zip',
      '/..%2fsecret.zip',
      '/..%5csecret.zip',
      '/old/pureflow-0.8.0.zip',
      '/old',
      '/',
    ]) {
      expect((await fetch(`${origin}${path}`)).status, path).toBe(404);
    }
    expect(serve.fileName('/..%2fsecret.zip')).toBeNull();
    expect(serve.fileName('/pureflow-0.9.0.zip')).toBe('pureflow-0.9.0.zip');
    expect((await fetch(`${origin}/pureflow-0.9.0.zip`, { method: 'PUT', body: 'x' })).status).toBe(405);
  });
});
