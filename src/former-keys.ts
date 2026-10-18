// The skin's keys in localStorage under its former name (former-name.ts), moved at the start.
import { FORMER_NAME } from './former-name';
import { SETTINGS_KEY } from './settings';
import { PREVIOUS_KEY } from './settings-page/sensor-calibration';
import { LOCATION_KEY } from './settings-page/tree';
import { SCREEN_KEY } from './shell/nav';

/** The skin's keys in localStorage: what it keeps under the new name, and what it kept under the former. */
export const MOVED_KEYS: readonly (readonly [string, string])[] = [SETTINGS_KEY, SCREEN_KEY, LOCATION_KEY, PREVIOUS_KEY].map(
  (key) => [key, key.replace(/^[^.]+/, FORMER_NAME)] as const,
);

/**
 * Moves each value kept under the former name to the new key, unless the new key holds one
 * already. Decaid derives a skin's port from its identity (research.md 9.1), so a new id likely
 * means a new origin and no former keys; then the backup brings the settings back.
 */
export function moveFormerKeys(store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage): void {
  try {
    for (const [key, former] of MOVED_KEYS) {
      const value = store.getItem(former);
      if (value === null) continue;
      if (store.getItem(key) === null) store.setItem(key, value);
      store.removeItem(former);
    }
  } catch {
    // no storage: nothing to move
  }
}
