// Skin > Skin version without UI: the skin's releases as GitHub lists them, newest first, and how
// Decaid installs one flavour of one of them. GitHub is asked only when the list is asked for, as
// the one outside service the skin talks to. The latest release is installed through Decaid's
// install from a GitHub release with the fixed asset name, so Decaid's update check follows the
// next release; an older one, or a release from before the fixed names, from its versioned ZIP's
// URL, which the update check then keeps.
import { errorMessage } from '../error-message';
import { zipNames } from './local-install';

export type Flavour = 'base' | 'ocr';

/** The two flavours in the order the page shows them, with their words. */
export const FLAVOURS: { id: Flavour; name: string }[] = [
  { id: 'base', name: 'small' },
  { id: 'ocr', name: 'with the bean bag reading' },
];

export interface Release {
  tag: string;
  /** the tag without its leading 'v' */
  version: string;
  /** when GitHub published it, ISO 8601 */
  published: string;
  /** the newest release: the one Decaid's install from a GitHub release takes */
  latest: boolean;
  /** each asset's name and its download URL */
  assets: Record<string, string>;
}

/** GitHub's list of a repository's releases, without a token: 60 requests an hour per address. */
export function releasesUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases`;
}

/** The releases of GitHub's answer, newest first; drafts and pre-releases are left out. */
export function readReleases(body: unknown): Release[] {
  if (!Array.isArray(body)) return [];
  const releases: Release[] = [];
  for (const entry of body as Record<string, unknown>[]) {
    if (typeof entry !== 'object' || entry === null || entry.draft || entry.prerelease) continue;
    const tag = entry.tag_name;
    if (typeof tag !== 'string' || !tag) continue;
    const assets: Record<string, string> = {};
    for (const asset of Array.isArray(entry.assets) ? (entry.assets as Record<string, unknown>[]) : []) {
      if (typeof asset?.name === 'string' && typeof asset.browser_download_url === 'string')
        assets[asset.name] = asset.browser_download_url;
    }
    const published = typeof entry.published_at === 'string' ? entry.published_at : '';
    releases.push({ tag, version: tag.replace(/^v/i, ''), published, latest: false, assets });
  }
  releases.sort((a, b) => b.published.localeCompare(a.published));
  if (releases.length) releases[0].latest = true;
  return releases;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The repository's releases from GitHub; throws with a sentence the page shows when it cannot. */
export async function fetchReleases(repo: string, fetchFn: Fetch = fetch): Promise<Release[]> {
  let response: Response;
  try {
    response = await fetchFn(releasesUrl(repo), { headers: { Accept: 'application/vnd.github+json' } });
  } catch (cause) {
    throw new Error(`GitHub could not be reached (${errorMessage(cause)}). Check the tablet's network and list again.`, {
      cause,
    });
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub refused the list for now: it answers 60 lists an hour per network. Try again later.');
  }
  if (!response.ok) throw new Error(`GitHub answered ${response.status}. List again later.`);
  return readReleases(await response.json());
}

/** The fixed name every release since the fixed names carries for a flavour: 'pureflow.zip'. */
export function fixedName(id: string, flavour: Flavour): string {
  return flavour === 'ocr' ? `${id}-ocr.zip` : `${id}.zip`;
}

/** The versioned name of a flavour's ZIP: 'pureflow-0.8.0-ocr.zip'. */
export function versionedName(id: string, version: string, flavour: Flavour): string {
  return zipNames(id, version, flavour === 'ocr')[0];
}

export type Install = { kind: 'release'; repo: string; asset: string } | { kind: 'url'; url: string; asset: string };

/** How Decaid installs a flavour of a release, or null when the release has no ZIP of it. */
export function installOf(id: string, repo: string, release: Release, flavour: Flavour): Install | null {
  const fixed = fixedName(id, flavour);
  if (release.latest && release.assets[fixed]) return { kind: 'release', repo, asset: fixed };
  const versioned = versionedName(id, release.version, flavour);
  const url = release.assets[versioned];
  return url ? { kind: 'url', url, asset: versioned } : null;
}

/** A release's date as the list shows it: '30 Oct 2026'. */
export function releaseDate(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return '';
  return `${time.getDate()} ${time.toLocaleString('en', { month: 'short' })} ${time.getFullYear()}`;
}

/** The question under 'Install <name> <version>?': what it replaces and what the update check does. */
export function installQuestion(name: string, running: string, install: Install): string {
  const after =
    install.kind === 'release'
      ? "Decaid's update check then installs each newer release of this flavour."
      : "Decaid's update check then keeps this version; install the latest here to follow the releases again.";
  return `It replaces ${name} ${running} on this tablet. ${after}`;
}
