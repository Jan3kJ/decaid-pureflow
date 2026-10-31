// Skin > Developer, 'Install from a local server', without UI: the developer switch and the
// server's address kept on this tablet, the server's ZIPs read from its `index.json`
// (`npm run serve-release`) or its directory listing, the names to type when neither can be read
// (Python's `http.server` sends no CORS header), and the words of the question and the errors.
// Decaid downloads the ZIP itself (`installSkinFromUrl`), so a listing the page cannot read does
// not keep a ZIP from being installed.
import { DecaidApiError } from '../api';
import { errorMessage } from '../error-message';

/** The port of `npm run serve-release` (scripts/serve-release.mjs), and of an address typed without one. */
export const LOCAL_PORT = 24810;

/** On this tablet only, like the settings location: not a setting, not in the backup. */
export const DEVELOPER_KEY = 'pureflow.developer';
export const SERVER_KEY = 'pureflow.local-server';

export function loadDeveloper(store: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return store.getItem(DEVELOPER_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveDeveloper(on: boolean, store: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): void {
  try {
    if (on) store.setItem(DEVELOPER_KEY, 'on');
    else store.removeItem(DEVELOPER_KEY);
  } catch {
    // no storage: the switch is off again next time
  }
}

export function loadServer(store: Pick<Storage, 'getItem'> = localStorage): string {
  try {
    return store.getItem(SERVER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveServer(address: string, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(SERVER_KEY, address);
  } catch {
    // no storage: the address is typed again next time
  }
}

/**
 * The server's base URL, ending in '/', from `host`, `host:port` or a full `http://` URL; the port
 * is 24810 when none is given. Null for an empty or unreadable address and for any scheme but http.
 */
export function serverBase(address: string): string | null {
  const typed = address.trim();
  if (!typed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `http://${typed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !url.hostname) return null;
  // URL drops a port that is the scheme's default, so ':80' typed stays 80.
  if (!url.port && !/^[a-z]+:\/\/(\[[^\]]*\]|[^/:]*):\d+/i.test(withScheme)) url.port = String(LOCAL_PORT);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** A ZIP's URL on the server. */
export function zipUrl(base: string, name: string): string {
  return new URL(encodeURIComponent(name), base).href;
}

/** A ZIP the server offers; size, time and sum only where its `index.json` names them. */
export interface LocalZip {
  name: string;
  size?: number;
  modified?: string;
  sha256?: string | null;
}

/** What the server's listing gave: its ZIPs, or why it could not be read. */
export type Listing = { zips: LocalZip[] } | { unread: string };

const isZip = (name: string) => /\.zip$/i.test(name) && !/[/\\]/.test(name);

/** The ZIPs of an `index.json`, newest first; null when it is not such a list. */
export function readIndex(body: unknown): LocalZip[] | null {
  if (!Array.isArray(body)) return null;
  const zips: LocalZip[] = [];
  for (const entry of body as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { name, size, modified, sha256 } = entry as Record<string, unknown>;
    if (typeof name !== 'string' || !isZip(name)) continue;
    zips.push({
      name,
      size: typeof size === 'number' ? size : undefined,
      modified: typeof modified === 'string' ? modified : undefined,
      sha256: typeof sha256 === 'string' ? sha256 : null,
    });
  }
  return zips.sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? '') || a.name.localeCompare(b.name));
}

/** The ZIPs a directory listing links to (its `href`s ending in `.zip`), by name, each once. */
export function readHtmlListing(html: string): LocalZip[] {
  const names = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"'?#]+)["']/gi)) {
    let name: string;
    try {
      name = decodeURIComponent(match[1].replace(/^\.?\//, ''));
    } catch {
      continue;
    }
    if (isZip(name)) names.add(name);
  }
  return [...names].sort((a, b) => b.localeCompare(a)).map((name) => ({ name }));
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** `index.json` first, then the directory listing; when neither is read, why the listing was not. */
export async function readListing(base: string, fetchFn: Fetch = fetch): Promise<Listing> {
  try {
    const response = await fetchFn(new URL('index.json', base).href, { cache: 'no-store' });
    const zips = response.ok ? readIndex(await response.json().catch(() => null)) : null;
    if (zips) return { zips };
  } catch {
    // no index.json, or one the page may not read: the listing is next
  }
  try {
    const response = await fetchFn(base, { cache: 'no-store' });
    if (response.ok) return { zips: readHtmlListing(await response.text()) };
    return { unread: `${response.status}` };
  } catch (cause) {
    return { unread: errorMessage(cause) };
  }
}

/** The ZIP names of a version: this flavour's first, then the other's. */
export function zipNames(id: string, version: string, ocr: boolean): [string, string] {
  const base = `${id}-${version}.zip`;
  const withOcr = `${id}-${version}-ocr.zip`;
  return ocr ? [withOcr, base] : [base, withOcr];
}

/** A size as the list shows it: '147 kB', '13.5 MB'. */
export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} kB`;
}

/** A listing's time as the list shows it: '31 Oct, 16:18', in the tablet's time zone. */
export function timeText(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = time.toLocaleString('en', { month: 'short' });
  return `${time.getDate()} ${month}, ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}

/** The question under 'Install <file>?': what the install replaces, and the way back. */
export function installQuestion(name: string, version: string): string {
  return `It replaces ${name} ${version} on this tablet. Decaid will look for its updates at this server; install from GitHub Release to go back.`;
}

/** Why an install failed: Decaid's own text where it gave one. */
export function installError(cause: unknown): string {
  if (cause instanceof DecaidApiError) {
    if (cause.status === 403) return 'This Decaid does not allow installing from a URL.';
    const body = cause.body;
    const text =
      typeof body === 'string'
        ? body
        : typeof body === 'object' && body !== null
          ? ((body as Record<string, unknown>).error ?? (body as Record<string, unknown>).message)
          : undefined;
    if (typeof text === 'string' && text) return `Decaid did not install it: ${text.replace(/^Exception:\s*/, '')}`;
  }
  return `Decaid did not install it: ${errorMessage(cause)}`;
}
