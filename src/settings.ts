// The skin's own settings, one object under one localStorage key (spec 4.1: sessionStorage
// does not survive the WebView). The settings page (D8c) will own these values; until then
// each one is set where it is used. The steam values are only read (the steam page).

export interface Settings {
  /** the editor shows the generated profile steps under the graph */
  showProfileSteps: boolean;
  /**
   * 'first-step workaround' (spec 3.2): a profile the editor generates starts with the Pre
   * Fill step. This is the one place it is read from; the settings page (D8c) shows it.
   */
  firstStepWorkaround: boolean;
  /** the category Steam (spec 3.4): what the steam page calculates with */
  steam: SteamSettings;
}

/** Every value is a number, or a list of numbers of a fixed length: the settings page can show them as they are. */
export interface SteamSettings {
  /** g, the empty mugs s, m and l */
  mugSmall: number;
  mugMedium: number;
  mugLarge: number;
  /** g, the milk of one drink: what mug detection steps by */
  milkPerDrink: number;
  /** the calibration: this many seconds steam this many grams of milk */
  referenceSeconds: number;
  referenceMilk: number;
  /** s, the three timer chips */
  favourites: number[];
}

/** The founder's values of 2026-10-12; the favourites are the sketch's. */
export const DEFAULT_STEAM_SETTINGS: SteamSettings = {
  mugSmall: 150,
  mugMedium: 225,
  mugLarge: 275,
  milkPerDrink: 150,
  referenceSeconds: 26,
  referenceMilk: 180,
  favourites: [25, 50, 30],
};

export const DEFAULT_SETTINGS: Settings = {
  showProfileSteps: true,
  firstStepWorkaround: false,
  steam: DEFAULT_STEAM_SETTINGS,
};

export const SETTINGS_KEY = 'decaid-skin.settings';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * The stored values of one group over its defaults. A value is taken when it has the
 * default's type: a boolean, an amount (a number from 0 up), a list of as many amounts, or a
 * group of such values.
 */
function merged<T extends object>(defaults: T, stored: unknown): T {
  const result: Record<string, unknown> = {};
  const values = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  for (const [key, standard] of Object.entries(defaults)) {
    const value = values[key];
    result[key] = standard;
    if (typeof standard === 'boolean') {
      if (typeof value === 'boolean') result[key] = value;
    } else if (typeof standard === 'number') {
      if (isAmount(value)) result[key] = value;
    } else if (Array.isArray(standard)) {
      if (Array.isArray(value) && value.length === standard.length && value.every(isAmount)) result[key] = [...value];
      else result[key] = [...standard];
    } else {
      result[key] = merged(standard as object, value);
    }
  }
  return result as T;
}

/** The stored settings over the defaults; anything unreadable or of the wrong type is ignored. */
export function loadSettings(store: Store = localStorage): Settings {
  let stored: unknown;
  try {
    stored = JSON.parse(store.getItem(SETTINGS_KEY) ?? '{}');
  } catch {
    // no storage, or not JSON: the defaults
  }
  return merged(DEFAULT_SETTINGS, stored);
}

export function saveSettings(settings: Settings, store: Store = localStorage): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // no storage: the setting lasts until the page unloads
  }
}
