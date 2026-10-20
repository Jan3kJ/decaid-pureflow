// The screen follows the machine's sleep: dim while it sleeps, the system's own brightness
// again when it is awake. Only where Decaid says the platform can (spec 3.1); elsewhere the
// brightness is not touched. A part of `Skin`, which hands it every machine frame's state.
//
// The menu's 'Machine and app sleep' (spec 3.9 item 2) makes the next sleep the app's too: the
// brightness goes to 0 and Decaid's wake lock is released, so the tablet's own timeout can
// switch the screen off. Decaid holds the lock while the machine is awake, and while it sleeps
// only for its setting `keepAwake` or the override (`POST /api/v1/display/wakelock`), so those
// two are switched off for the sleep and put back at the wake (research.md 13). What is to be
// put back is kept in `localStorage` too, so a reload while asleep does not lose it.
import type { DecaidClient, DisplayState } from '../api';

/** The screen's brightness while the machine sleeps, 0-100; 100 is the system's own. */
export const SLEEP_BRIGHTNESS = 5;
/** The screen's brightness while the machine and the app sleep. */
export const APP_SLEEP_BRIGHTNESS = 0;
/** where the wake lock settings to put back at the wake are kept */
export const APP_SLEEP_KEY = 'pureflow.app-sleep';

/** What the app's sleep switched off, to be switched on again at the wake. */
export interface Released {
  keepAwake: boolean;
  wakeLockOverride: boolean;
}

type Client = Pick<DecaidClient, 'getDisplay' | 'setBrightness' | 'setWakeLock' | 'getSettings' | 'updateSettings'>;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readReleased(store: Store): Released | null {
  try {
    const value = JSON.parse(store.getItem(APP_SLEEP_KEY) ?? 'null') as Partial<Released> | null;
    return value && typeof value === 'object'
      ? { keepAwake: value.keepAwake === true, wakeLockOverride: value.wakeLockOverride === true }
      : null;
  } catch {
    return null;
  }
}

export class Dimmer {
  /** the skin lowered the screen's brightness for a sleeping machine */
  private dimmed = false;
  /** the next sleep is the app's too */
  private appNext = false;
  /** what the app's sleep switched off; put back at the next wake */
  private released: Released | null;
  private readonly client: Client;
  private readonly store: Store;

  constructor(client: Client, store: Store = localStorage) {
    this.client = client;
    this.store = store;
    this.released = readReleased(store);
  }

  /** The next sleep is the machine's and the app's: called just before `sleeping` is asked for. */
  sleepApp(): void {
    this.appNext = true;
  }

  /** The machine did not go to sleep: the next sleep is the machine's alone again. */
  cancelApp(): void {
    this.appNext = false;
  }

  /** Called with every machine frame; only a change of sleep asks Decaid. */
  async follow(asleep: boolean): Promise<void> {
    const putBack = asleep ? null : this.released;
    if (asleep === this.dimmed && !putBack) return;
    this.dimmed = asleep;
    const app = asleep && this.appNext;
    this.appNext = false;
    if (putBack) this.forget();
    try {
      const display = await this.client.getDisplay();
      if (app) await this.release(display);
      if (putBack) await this.restore(putBack);
      if (display.platformSupported?.brightness !== true) return;
      await this.client.setBrightness(asleep ? (app ? APP_SLEEP_BRIGHTNESS : SLEEP_BRIGHTNESS) : 100);
    } catch {
      // The brightness is a comfort; the machine's state is on screen either way.
    }
  }

  /** Lets the screen go off: what keeps Decaid's wake lock during a sleep is switched off. */
  private async release(display: DisplayState): Promise<void> {
    if (display.platformSupported?.wakeLock !== true) return;
    const settings = await this.client.getSettings();
    const released: Released = { keepAwake: settings.keepAwake === true, wakeLockOverride: display.wakeLockOverride === true };
    if (!released.keepAwake && !released.wakeLockOverride) return;
    // Kept before the change, so that the wake puts it back whatever happens in between.
    this.released = released;
    this.store.setItem(APP_SLEEP_KEY, JSON.stringify(released));
    if (released.wakeLockOverride) await this.client.setWakeLock(false);
    if (released.keepAwake) await this.client.updateSettings({ keepAwake: false });
  }

  private async restore(released: Released): Promise<void> {
    if (released.keepAwake) await this.client.updateSettings({ keepAwake: true });
    if (released.wakeLockOverride) await this.client.setWakeLock(true);
  }

  private forget(): void {
    this.released = null;
    this.store.removeItem(APP_SLEEP_KEY);
  }
}
