// The skin's own settings, one object under one localStorage key (spec 4.1: sessionStorage
// does not survive the WebView). This is the only store of settings: the skin holds one copy
// of it (`Skin.settings`), the settings page changes it, and every screen reads it there.

export interface Settings {
  /** the editor shows the generated profile steps under the graph */
  showProfileSteps: boolean;
  /**
   * 'first-step workaround' (spec 3.2): a profile the editor generates starts with the Pre
   * Fill step. This is the one place it is read from; the settings page shows it.
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

/** One number of the settings page: where it is in the steam settings, and what the number pad allows. */
export interface SteamField {
  /** the name in the tests */
  id: string;
  label: string;
  key: keyof SteamSettings;
  /** the place in a list (the favourites) */
  index?: number;
  unit: 'g' | 's';
  min: number;
  max: number;
  /** grams take one decimal, seconds are whole: the machine's timer is (research.md 8.3) */
  decimals: boolean;
}

const grams = (id: string, label: string, key: keyof SteamSettings, min: number): SteamField => ({
  id,
  label,
  key,
  unit: 'g',
  min,
  max: 1000,
  decimals: true,
});
const seconds = (id: string, label: string, key: keyof SteamSettings, index?: number): SteamField => ({
  id,
  label,
  key,
  index,
  unit: 's',
  min: 1,
  max: 255,
  decimals: false,
});

/** The category Steam of the settings page, in the groups it shows (spec 3.4). */
export const STEAM_FIELDS: { title: string; hint: string; fields: SteamField[] }[] = [
  {
    title: 'mugs',
    hint: 'the weight of each empty mug',
    fields: [
      grams('mug-small', 's', 'mugSmall', 0),
      grams('mug-medium', 'm', 'mugMedium', 0),
      grams('mug-large', 'l', 'mugLarge', 0),
    ],
  },
  {
    title: 'calibration',
    hint: 'this many seconds steam this much milk',
    fields: [seconds('reference-seconds', 'seconds', 'referenceSeconds'), grams('reference-milk', 'milk', 'referenceMilk', 1)],
  },
  {
    title: 'milk of one drink',
    hint: 'what the mug detection steps by',
    fields: [grams('milk-per-drink', 'milk', 'milkPerDrink', 1)],
  },
  {
    title: 'favourite timers',
    hint: 'the three chips of the steam page',
    fields: [0, 1, 2].map((index) => seconds(`favourite-${index + 1}`, `${index + 1}`, 'favourites', index)),
  },
];

export function steamValue(steam: SteamSettings, field: SteamField): number {
  const value = steam[field.key];
  return Array.isArray(value) ? value[field.index ?? 0] : value;
}

/** The steam settings with one value changed; the value is held inside the field's range. */
export function withSteamValue(steam: SteamSettings, field: SteamField, value: number): SteamSettings {
  const held = Math.min(field.max, Math.max(field.min, field.decimals ? Math.round(value * 10) / 10 : Math.round(value)));
  const before = steam[field.key];
  const next = Array.isArray(before) ? before.map((item, i) => (i === (field.index ?? 0) ? held : item)) : held;
  return { ...steam, [field.key]: next };
}
