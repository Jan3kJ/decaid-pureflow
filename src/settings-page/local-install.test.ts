import { describe, expect, it } from 'vitest';
import { DecaidApiError } from '../api';
import {
  DEVELOPER_KEY,
  SERVER_KEY,
  installError,
  installQuestion,
  loadDeveloper,
  loadServer,
  readHtmlListing,
  readIndex,
  readListing,
  saveDeveloper,
  saveServer,
  serverBase,
  sizeText,
  zipNames,
  zipUrl,
} from './local-install';

// Skin > Developer, 'Install from a local server', without UI: the address, the two listings,
// the names to type, the words of the question and of a failed install.

function storage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

/** The listing of `python -m http.server 24810 --directory release`, as Python 3.12 writes it. */
const PYTHON_LISTING = `<!DOCTYPE HTML>
<html lang="en">
<head><meta charset="utf-8"><title>Directory listing for /</title></head>
<body>
<h1>Directory listing for /</h1>
<hr>
<ul>
<li><a href="pureflow-0.9.0-ocr.zip">pureflow-0.9.0-ocr.zip</a></li>
<li><a href="pureflow-0.9.0.zip">pureflow-0.9.0.zip</a></li>
<li><a href="pureflow%200.9.1.zip">pureflow 0.9.1.zip</a></li>
<li><a href="SHA256SUMS.txt">SHA256SUMS.txt</a></li>
<li><a href="old/">old/</a></li>
</ul>
<hr>
</body>
</html>
`;

const INDEX = [
  { name: 'pureflow-0.9.0.zip', size: 147483, modified: '2026-10-31T15:00:32.548Z', sha256: 'c845' },
  { name: 'pureflow-0.9.1-ocr.zip', size: 13504278, modified: '2026-11-02T09:00:00.000Z', sha256: null },
  { name: '../evil.zip', size: 1, modified: '2026-11-03T09:00:00.000Z' },
  { name: 'notes.txt', size: 1 },
];

describe('the developer switch and the server address', () => {
  it('is off by default, and both are kept on this tablet', () => {
    const store = storage();
    expect(loadDeveloper(store)).toBe(false);
    saveDeveloper(true, store);
    expect(store.store.get(DEVELOPER_KEY)).toBe('on');
    expect(loadDeveloper(store)).toBe(true);
    saveDeveloper(false, store);
    expect(loadDeveloper(store)).toBe(false);

    expect(loadServer(store)).toBe('');
    saveServer('192.168.1.20', store);
    expect(store.store.get(SERVER_KEY)).toBe('192.168.1.20');
    expect(loadServer(store)).toBe('192.168.1.20');
  });

  it('reads an address with port 24810 when none is typed', () => {
    expect(serverBase('192.168.1.20')).toBe('http://192.168.1.20:24810/');
    expect(serverBase(' 192.168.1.20:8000 ')).toBe('http://192.168.1.20:8000/');
    expect(serverBase('http://pc.local:24810/release')).toBe('http://pc.local:24810/release/');
    expect(serverBase('http://pc.local/')).toBe('http://pc.local:24810/');
    expect(serverBase('http://pc.local:80/')).toBe('http://pc.local/');
    expect(serverBase('')).toBeNull();
    expect(serverBase('https://pc.local')).toBeNull();
    expect(serverBase('http://')).toBeNull();
  });

  it("makes a ZIP's URL on the server", () => {
    expect(zipUrl('http://192.168.1.20:24810/', 'pureflow-0.9.0.zip')).toBe('http://192.168.1.20:24810/pureflow-0.9.0.zip');
    expect(zipUrl('http://pc:24810/release/', 'a b.zip')).toBe('http://pc:24810/release/a%20b.zip');
  });
});

describe('the listings', () => {
  it("reads serve-release's index.json, newest first, ZIPs directly in the folder only", () => {
    expect(readIndex(INDEX)).toEqual([
      { name: 'pureflow-0.9.1-ocr.zip', size: 13504278, modified: '2026-11-02T09:00:00.000Z', sha256: null },
      { name: 'pureflow-0.9.0.zip', size: 147483, modified: '2026-10-31T15:00:32.548Z', sha256: 'c845' },
    ]);
    expect(readIndex({ files: [] })).toBeNull();
  });

  it("reads the ZIPs of Python's directory listing", () => {
    expect(readHtmlListing(PYTHON_LISTING).map((zip) => zip.name)).toEqual([
      'pureflow-0.9.0.zip',
      'pureflow-0.9.0-ocr.zip',
      'pureflow 0.9.1.zip',
    ]);
  });

  const answer = (status: number, body: string) => Promise.resolve(new Response(body, { status }));

  it('tries index.json first, then the listing, and says why when the page may read neither', async () => {
    const asked: string[] = [];
    const indexed = await readListing('http://pc:24810/', (url) => (asked.push(url), answer(200, JSON.stringify(INDEX))));
    expect(asked).toEqual(['http://pc:24810/index.json']);
    expect('zips' in indexed && indexed.zips.length).toBe(2);

    const listed = await readListing('http://pc:24810/', (url) =>
      url.endsWith('index.json') ? answer(404, 'File not found') : answer(200, PYTHON_LISTING),
    );
    expect('zips' in listed && listed.zips.map((zip) => zip.name)).toContain('pureflow-0.9.0-ocr.zip');

    // A server without CORS: the browser refuses both answers.
    const blocked = await readListing('http://pc:24810/', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(blocked).toEqual({ unread: 'Failed to fetch' });
  });
});

describe('the words', () => {
  it("names the running version's ZIP first, then the other flavour's", () => {
    expect(zipNames('pureflow', false)).toEqual(['pureflow.zip', 'pureflow-ocr.zip']);
    expect(zipNames('pureflow', true)).toEqual(['pureflow-ocr.zip', 'pureflow.zip']);
  });

  it('shows sizes in kB and MB', () => {
    expect(sizeText(147483)).toBe('147 kB');
    expect(sizeText(13504278)).toBe('13.5 MB');
    expect(sizeText(12)).toBe('1 kB');
  });

  it('asks with what is replaced and the way back', () => {
    expect(installQuestion('pureflow', '0.9.0')).toBe(
      'It replaces pureflow 0.9.0 on this tablet. Decaid will look for its updates at this server; install from GitHub Release to go back.',
    );
  });

  it("shows Decaid's error, and the 403 of an App Store build in words", () => {
    const path = '/api/v1/webui/skins/install/url';
    expect(installError(new DecaidApiError('POST', path, 500, { error: 'Exception: Failed to download: 404' }))).toBe(
      'Decaid did not install it: Failed to download: 404',
    );
    expect(installError(new DecaidApiError('POST', path, 403, { error: 'Forbidden' }))).toBe(
      'This Decaid does not allow installing from a URL.',
    );
    expect(installError(new Error('no answer'))).toBe('Decaid did not install it: no answer');
  });
});
