// The skin's own settings, one object under one localStorage key (spec 4.1: sessionStorage
// does not survive the WebView). This is the only store of settings: the skin holds one copy
// of it (`Skin.settings`), the settings page changes it, and every screen reads it there.
// A copy in Decaid's KV store is its backup (settings-backup.ts, founder, 2026-10-14).
import { DEFAULT_PROFILES } from './aflow/defaults';
import { DOSE_MAX, MAX_FLOW_RANGE } from './aflow/validate';
import { isOnTemperature } from './shell/steam-heater';

export interface Settings {
  /** the editor offers the generated profile steps under the graph; its panel opens closed (founder, 2026-10-13) */
  showProfileSteps: boolean;
  /**
   * 'first-step workaround' (spec 3.2): a profile the editor generates starts with the Pre
   * Fill step. This is the one place it is read from; the settings page shows it.
   */
  firstStepWorkaround: boolean;
  /** the shot graph shows its legend under it: on home, on the espresso screen and for a shot of the history */
  showGraphLegend: boolean;
  /** the shot overlay shows the per-phase values after a shot (spec 3.10); off, the graph takes their room */
  showShotValues: boolean;
  /**
   * The editor's row of profiles to start from (founder, 2026-10-13): five slots, each the
   * title of an A-Flow 3.0 profile or null for an empty one. A title, not an id: the id is a
   * hash of the steps and changes with every save (research.md 11), the title stays, as in
   * the shot history.
   */
  startProfiles: (string | null)[];
  /**
   * ml/s, the highest pump flow the A-Flow editor offers (founder, 2026-10-15: newer machines
   * drive more than 8). Read through `machineLimits`, which holds it in `MAX_FLOW_RANGE`.
   */
  maxFlow: number;
  /**
   * g, the dose a shot takes when neither its profile nor the user set one (founder,
   * 2026-10-15). Written to the workflow by `doseToSet` (src/shell/profiles.ts).
   */
  defaultDose: number;
  /** the category Steam (spec 3.4): what the steam page calculates with */
  steam: SteamSettings;
  /** the category Hot water (spec 3.7): what the hot water page offers */
  hotWater: HotWaterSettings;
}

export interface HotWaterSettings {
  /**
   * The three ratio favourites of the hot water page: the shot's weight times the ratio is the
   * stop at weight, 2.5 for 1:2.5.
   */
  ratios: number[];
}

/** The founder's, 2026-10-16: 1:2, 1:2.5 and 1:3. */
export const DEFAULT_HOT_WATER_SETTINGS: HotWaterSettings = { ratios: [2, 2.5, 3] };

/** what a ratio may be, one decimal: 1:0.5 to 1:10 */
export const RATIO_RANGE = { min: 0.5, max: 10 };

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
  /**
   * s, the three adjust buttons above 'set timer' (spec 3.7): a selected one is added to the
   * calculated timer or to a favourite. The one list of numbers that may be negative.
   */
  adjustments: number[];
  /**
   * °C, what the menu's steam switch turns the steam heater on with again (spec 3.7): the
   * workflow's temperature when it was switched off; 135-165, not on the settings page.
   */
  heaterTemperature: number;
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
  adjustments: [-8, -4, 5],
  heaterTemperature: 150,
};

/** s, what an adjust button may add or take off */
export const ADJUST_RANGE = { min: -60, max: 60 };

/** The editor's row holds up to five profiles. */
export const START_SLOTS = 5;

/** The five A-Flow 3.0 defaults in their order (spec 3.2): the row as it was before it could be chosen. */
export const DEFAULT_START_PROFILES: (string | null)[] = DEFAULT_PROFILES.map((entry) => entry.title);

export const DEFAULT_SETTINGS: Settings = {
  showProfileSteps: true,
  firstStepWorkaround: false,
  showGraphLegend: true,
  showShotValues: true,
  startProfiles: DEFAULT_START_PROFILES,
  maxFlow: 8,
  defaultDose: 18,
  steam: DEFAULT_STEAM_SETTINGS,
  hotWater: DEFAULT_HOT_WATER_SETTINGS,
};

export const SETTINGS_KEY = 'pureflow.settings';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

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
      else result[key] = [...(standard as unknown[])];
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
  return readSettings(stored);
}

/**
 * Settings from any value, field by field over the defaults: what localStorage holds and what
 * a backup holds (founder, 2026-10-14) pass the same checks.
 */
export function readSettings(stored: unknown): Settings {
  const settings = merged(DEFAULT_SETTINGS, stored);
  const values = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const steam = (values.steam && typeof values.steam === 'object' ? values.steam : {}) as Record<string, unknown>;
  return {
    ...settings,
    steam: {
      ...settings.steam,
      adjustments: readAdjustments(steam.adjustments),
      heaterTemperature: isOnTemperature(steam.heaterTemperature) ? steam.heaterTemperature : DEFAULT_STEAM_SETTINGS.heaterTemperature,
    },
    hotWater: { ratios: readRatios(settings.hotWater.ratios) },
    startProfiles: readStartProfiles(values.startProfiles),
  };
}

/** The stored adjust amounts: three whole seconds in their range, else the defaults. */
export function readAdjustments(stored: unknown): number[] {
  const fits = (value: unknown) =>
    Number.isInteger(value) && (value as number) >= ADJUST_RANGE.min && (value as number) <= ADJUST_RANGE.max;
  const defaults = DEFAULT_STEAM_SETTINGS.adjustments;
  return Array.isArray(stored) && stored.length === defaults.length && stored.every(fits) ? [...(stored as number[])] : [...defaults];
}

/** The ratio favourites: three amounts in their range, else the defaults. */
export function readRatios(stored: readonly number[]): number[] {
  const fits = (value: number) => value >= RATIO_RANGE.min && value <= RATIO_RANGE.max;
  return stored.every(fits) ? [...stored] : [...DEFAULT_HOT_WATER_SETTINGS.ratios];
}

/** One ratio favourite changed, held inside the range and to one decimal. */
export function withRatio(hotWater: HotWaterSettings, index: number, value: number): HotWaterSettings {
  const held = Math.min(RATIO_RANGE.max, Math.max(RATIO_RANGE.min, Math.round(value * 10) / 10));
  return { ...hotWater, ratios: hotWater.ratios.map((ratio, i) => (i === index ? held : ratio)) };
}

/** Whether this tablet and port hold settings at all: a new port or a cleared app does not. */
export function hasSettings(store: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    return store.getItem(SETTINGS_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * The stored slots of the start row: the first five, a title or null each, a title once.
 * Anything that is not a list gives the defaults; a slot that is not a title is empty.
 */
export function readStartProfiles(stored: unknown): (string | null)[] {
  if (!Array.isArray(stored)) return [...DEFAULT_START_PROFILES];
  const slots: (string | null)[] = [];
  for (const value of stored.slice(0, START_SLOTS)) {
    const title = typeof value === 'string' && value.trim() !== '' ? value : null;
    slots.push(title !== null && slots.includes(title) ? null : title);
  }
  while (slots.length < START_SLOTS) slots.push(null);
  return slots;
}

/** The slots with one changed; a profile sits in one slot only, so it leaves the one it was in. */
export function withStartProfile(slots: readonly (string | null)[], index: number, title: string | null): (string | null)[] {
  return slots.map((slot, i) => (i === index ? title : title !== null && slot === title ? null : slot));
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

/** One adjust button's amount: whole seconds, below 0 too. */
const amount = (index: number): SteamField => ({
  id: `adjust-${index + 1}`,
  label: `${index + 1}`,
  key: 'adjustments',
  index,
  unit: 's',
  ...ADJUST_RANGE,
  decimals: false,
});

/** The category Steam of the settings page, in the groups it shows (spec 3.4, 3.7). */
export const STEAM_FIELDS: { title: string; hint: string; fields: SteamField[] }[] = [
  {
    title: 'mugs',
    hint: 'the weight of each empty mug',
    fields: [grams('mug-small', 's', 'mugSmall', 0), grams('mug-medium', 'm', 'mugMedium', 0), grams('mug-large', 'l', 'mugLarge', 0)],
  },
  // One row with the milk of one drink, so the adjust buttons fit the page (spec 3.7).
  {
    title: 'calibration',
    hint: 'this many seconds steam this much milk; one drink is what the mug detection steps by',
    fields: [
      seconds('reference-seconds', 'seconds', 'referenceSeconds'),
      grams('reference-milk', 'milk', 'referenceMilk', 1),
      grams('milk-per-drink', 'one drink', 'milkPerDrink', 1),
    ],
  },
  {
    title: 'favourite timers',
    hint: 'the three chips of the steam page',
    fields: [0, 1, 2].map((index) => seconds(`favourite-${index + 1}`, `${index + 1}`, 'favourites', index)),
  },
  {
    title: 'adjust buttons',
    hint: 'added to the timer or a favourite, when selected',
    fields: [0, 1, 2].map(amount),
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

/** One number of the category Profile: a value of the settings object itself. */
export interface ProfileField {
  /** the name in the tests */
  id: string;
  label: string;
  key: 'maxFlow' | 'defaultDose';
  unit: string;
  min: number;
  max: number;
}

/** The category Profile's numbers, one decimal each (founder, 2026-10-15). */
export const PROFILE_FIELDS: ProfileField[] = [
  { id: 'max-flow', label: 'max flow', key: 'maxFlow', unit: 'ml/s', ...MAX_FLOW_RANGE },
  // The editor's dose range from 5 g up: a dose below that is no shot.
  { id: 'default-dose', label: 'default dose', key: 'defaultDose', unit: 'g', min: 5, max: DOSE_MAX },
];

/** A value of the category Profile, held inside its range and to one decimal. */
export function profileValue(settings: Settings, field: ProfileField, value: number = settings[field.key]): number {
  return Math.min(field.max, Math.max(field.min, Math.round(value * 10) / 10));
}
