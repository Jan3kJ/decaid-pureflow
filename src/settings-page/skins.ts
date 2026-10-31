// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
// src/settings/settings.js (renderSkinSettings, setActiveSkin, waitForSkinServer).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// Skin > Active Skin without UI: the installed skins with the default one first, and the switch:
// Decaid's default skin is set and checked, its skin server is started again so it serves the
// new default, and the port it serves on is read back. The page then opens that port. And the
// reload: Decaid serves a skin's new files on the same port as soon as it has installed them, so
// after an update this page only has to load itself again.
import type { DecaidClient, WebUiSkin } from '../api';

/** How long the skin server may take to come back, and how often it is asked (Streamline's). */
export const SERVER_WAIT_MS = 20_000;
export const SERVER_POLL_MS = 500;
/** How long the page waits for the skin it opened before it says it did not open. */
export const OPEN_WAIT_MS = 6000;

/** What `GET /api/v1/webui/skins` lists, the default skin first, the others by name. */
export function orderSkins(skins: readonly WebUiSkin[], defaultId: string | null): WebUiSkin[] {
  return [...skins].sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId) || a.name.localeCompare(b.name, 'en'));
}

type SkinClient = Pick<
  DecaidClient,
  'setDefaultSkin' | 'getDefaultSkin' | 'stopWebUiServer' | 'startWebUiServer' | 'getWebUiServerStatus'
>;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Makes `skinId` Decaid's default skin and serves it: the port it is served on. Throws when
 * Decaid keeps another default or its skin server does not come back in time.
 */
export async function switchSkin(
  client: SkinClient,
  skinId: string,
  wait: (ms: number) => Promise<void> = pause,
  timeoutMs = SERVER_WAIT_MS,
): Promise<number> {
  await client.setDefaultSkin(skinId);
  const active = await client.getDefaultSkin();
  if (active.id !== skinId) throw new Error(`Decaid kept ${active.name || active.id} as its default skin.`);
  await client.stopWebUiServer();
  await client.startWebUiServer();
  for (let waited = 0; waited < timeoutMs; waited += SERVER_POLL_MS) {
    await wait(SERVER_POLL_MS);
    try {
      const status = await client.getWebUiServerStatus();
      if (status.serving && status.port) return status.port;
    } catch {
      // the server is still down
    }
  }
  throw new Error('The skin is set, but Decaid does not serve it yet. Restart Decaid.');
}

/** The address of a skin Decaid serves on `port`, on this page's host. */
export function skinAddress(port: number, here: Pick<Location, 'protocol' | 'hostname'>): string {
  return `${here.protocol}//${here.hostname}:${port}/`;
}

/** A version as Decaid's list and a manifest write it, with or without a leading 'v'. */
const bare = (version: string | null | undefined) => (version ?? '').trim().replace(/^v/i, '');

/**
 * The version Decaid holds of this skin when it differs from the one this page runs, else null:
 * only when this skin is Decaid's default, the one its skin server serves.
 */
export function installedOther(served: WebUiSkin | null, id: string, running: string): string | null {
  if (!served || served.id !== id || !bare(served.version)) return null;
  return bare(served.version) === bare(running) ? null : bare(served.version);
}

/** What the reload row says. */
export function reloadLine(name: string, installed: string, running: string): string {
  return `${name} ${installed} is installed, this screen runs ${bare(running)}`;
}
