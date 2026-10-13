// The skin's own settings, one object under one localStorage key (spec 4.1: sessionStorage
// does not survive the WebView). The settings page (D8c) will own these values; until then
// each one is set where it is used.

export interface Settings {
  /** the editor shows the generated profile steps under the graph */
  showProfileSteps: boolean;
  /**
   * 'first-step workaround' (spec 3.2): a profile the editor generates starts with the Pre
   * Fill step. This is the one place it is read from; the settings page (D8c) shows it.
   */
  firstStepWorkaround: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showProfileSteps: true, firstStepWorkaround: false };

export const SETTINGS_KEY = 'decaid-skin.settings';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The stored settings over the defaults; anything unreadable or of the wrong type is ignored. */
export function loadSettings(store: Store = localStorage): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const stored: unknown = JSON.parse(store.getItem(SETTINGS_KEY) ?? '{}');
    if (stored && typeof stored === 'object') {
      for (const key of Object.keys(settings) as (keyof Settings)[]) {
        const value = (stored as Record<string, unknown>)[key];
        if (typeof value === typeof settings[key]) settings[key] = value as Settings[typeof key];
      }
    }
  } catch {
    // no storage, or not JSON: the defaults
  }
  return settings;
}

export function saveSettings(settings: Settings, store: Store = localStorage): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // no storage: the setting lasts until the page unloads
  }
}
