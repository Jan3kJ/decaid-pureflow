import { describe, expect, it } from 'vitest';
import {
  fetchReleases,
  fixedName,
  installOf,
  installQuestion,
  readReleases,
  releaseDate,
  releasesUrl,
  versionedName,
} from './releases';

// Skin > Skin version without UI: GitHub's list of releases read and ordered, the asset each
// flavour of each release is installed from, and the words when GitHub cannot be asked.

const asset = (tag: string, name: string) => ({
  name,
  browser_download_url: `https://github.com/owner/skin/releases/download/${tag}/${name}`,
});

/** A list as GitHub answers it, in no particular order: one release with the fixed names. */
const LIST = [
  {
    tag_name: 'v0.9.0',
    published_at: '2026-10-30T19:59:56Z',
    draft: false,
    prerelease: false,
    assets: [asset('v0.9.0', 'pureflow-0.9.0.zip'), asset('v0.9.0', 'pureflow-0.9.0-ocr.zip'), asset('v0.9.0', 'SHA256SUMS.txt')],
  },
  { tag_name: 'v1.1.0-rc.1', published_at: '2026-11-03T08:00:00Z', draft: false, prerelease: true, assets: [] },
  {
    tag_name: 'v1.0.0',
    published_at: '2026-11-02T10:00:00Z',
    draft: false,
    prerelease: false,
    assets: [
      asset('v1.0.0', 'pureflow-1.0.0.zip'),
      asset('v1.0.0', 'pureflow-1.0.0-ocr.zip'),
      asset('v1.0.0', 'pureflow.zip'),
      asset('v1.0.0', 'pureflow-ocr.zip'),
    ],
  },
  { tag_name: 'v1.2.0', published_at: null, draft: true, prerelease: false, assets: [] },
  {
    tag_name: 'v0.7.0',
    published_at: '2026-10-27T19:16:42Z',
    draft: false,
    prerelease: false,
    assets: [asset('v0.7.0', 'pureflow-0.7.0.zip')],
  },
];

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('the list', () => {
  it('asks GitHub for the repository releases', () => {
    expect(releasesUrl('owner/skin')).toBe('https://api.github.com/repos/owner/skin/releases');
  });

  it('keeps the published releases, newest first, and marks the newest as the latest', () => {
    const releases = readReleases(LIST);
    expect(releases.map((release) => [release.version, release.latest])).toEqual([
      ['1.0.0', true],
      ['0.9.0', false],
      ['0.7.0', false],
    ]);
    expect(releases[1].assets['pureflow-0.9.0-ocr.zip']).toBe(
      'https://github.com/owner/skin/releases/download/v0.9.0/pureflow-0.9.0-ocr.zip',
    );
  });

  it('reads nothing from an answer that is no list', () => {
    expect(readReleases({ message: 'Not Found' })).toEqual([]);
    expect(readReleases([null, { tag_name: 3 }])).toEqual([]);
  });

  it('reads the list through fetch, and says so when GitHub cannot be asked', async () => {
    const asked: string[] = [];
    const releases = await fetchReleases('owner/skin', (url) => (asked.push(url), Promise.resolve(response(200, LIST))));
    expect(asked).toEqual(['https://api.github.com/repos/owner/skin/releases']);
    expect(releases).toHaveLength(3);

    await expect(fetchReleases('owner/skin', () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toThrow(
      "GitHub could not be reached (Failed to fetch). Check the tablet's network and list again.",
    );
    await expect(fetchReleases('owner/skin', () => Promise.resolve(response(403, {})))).rejects.toThrow('60 lists an hour');
    await expect(fetchReleases('owner/skin', () => Promise.resolve(response(502, {})))).rejects.toThrow('GitHub answered 502.');
  });
});

describe('the install', () => {
  const [latest, older, oldest] = readReleases(LIST);

  it('names the fixed and the versioned ZIP of each flavour', () => {
    expect([fixedName('pureflow', 'base'), fixedName('pureflow', 'ocr')]).toEqual(['pureflow.zip', 'pureflow-ocr.zip']);
    expect([versionedName('pureflow', '0.8.0', 'base'), versionedName('pureflow', '0.8.0', 'ocr')]).toEqual([
      'pureflow-0.8.0.zip',
      'pureflow-0.8.0-ocr.zip',
    ]);
  });

  it('installs the latest from the GitHub release under its fixed name', () => {
    expect(installOf('pureflow', 'owner/skin', latest, 'base')).toEqual({
      kind: 'release',
      repo: 'owner/skin',
      asset: 'pureflow.zip',
    });
    expect(installOf('pureflow', 'owner/skin', latest, 'ocr')).toEqual({
      kind: 'release',
      repo: 'owner/skin',
      asset: 'pureflow-ocr.zip',
    });
  });

  it('installs a release from before the fixed names from its versioned ZIP, and none the release does not have', () => {
    expect(installOf('pureflow', 'owner/skin', older, 'ocr')).toEqual({
      kind: 'url',
      url: 'https://github.com/owner/skin/releases/download/v0.9.0/pureflow-0.9.0-ocr.zip',
      asset: 'pureflow-0.9.0-ocr.zip',
    });
    expect(installOf('pureflow', 'owner/skin', oldest, 'ocr')).toBeNull();
  });

  it('installs a latest release without the fixed names from its versioned ZIP', () => {
    const [only] = readReleases([LIST[0]]);
    expect(only.latest).toBe(true);
    expect(installOf('pureflow', 'owner/skin', only, 'base')).toMatchObject({ kind: 'url', asset: 'pureflow-0.9.0.zip' });
  });

  it('takes the four kinds of release: newest; older with the fixed name only; older with both; old with the versioned name only', () => {
    const [newest, fixedOnly, both, versionedOnly] = readReleases([
      { tag_name: 'v0.12.0', published_at: '2026-12-04T10:00:00Z', assets: [asset('v0.12.0', 'pureflow.zip')] },
      { tag_name: 'v0.11.0', published_at: '2026-12-03T10:00:00Z', assets: [asset('v0.11.0', 'pureflow.zip')] },
      {
        tag_name: 'v0.10.0',
        published_at: '2026-12-02T10:00:00Z',
        assets: [asset('v0.10.0', 'pureflow-0.10.0.zip'), asset('v0.10.0', 'pureflow.zip')],
      },
      { tag_name: 'v0.9.0', published_at: '2026-12-01T10:00:00Z', assets: [asset('v0.9.0', 'pureflow-0.9.0.zip')] },
    ]);
    expect(installOf('pureflow', 'owner/skin', newest, 'base')).toEqual({
      kind: 'release',
      repo: 'owner/skin',
      asset: 'pureflow.zip',
    });
    expect(installOf('pureflow', 'owner/skin', fixedOnly, 'base')).toEqual({
      kind: 'url',
      url: 'https://github.com/owner/skin/releases/download/v0.11.0/pureflow.zip',
      asset: 'pureflow.zip',
    });
    expect(installOf('pureflow', 'owner/skin', both, 'base')).toEqual({
      kind: 'url',
      url: 'https://github.com/owner/skin/releases/download/v0.10.0/pureflow.zip',
      asset: 'pureflow.zip',
    });
    expect(installOf('pureflow', 'owner/skin', versionedOnly, 'base')).toEqual({
      kind: 'url',
      url: 'https://github.com/owner/skin/releases/download/v0.9.0/pureflow-0.9.0.zip',
      asset: 'pureflow-0.9.0.zip',
    });
  });

  it('says what the install replaces and what the update check does after it', () => {
    expect(installQuestion('pureflow', '0.9.0', { kind: 'release', repo: 'o/r', asset: 'pureflow.zip' })).toBe(
      "It replaces pureflow 0.9.0 on this tablet. Decaid's update check then installs each newer release of this flavour.",
    );
    expect(installQuestion('pureflow', '0.9.0', { kind: 'url', url: 'u', asset: 'pureflow-0.8.0.zip' })).toContain(
      'keeps this version',
    );
  });

  it('dates a release by its day', () => {
    expect(releaseDate('2026-10-30T12:00:00Z')).toBe('30 Oct 2026');
    expect(releaseDate('')).toBe('');
  });
});
