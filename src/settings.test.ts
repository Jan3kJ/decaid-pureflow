import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_STEAM_SETTINGS,
  SETTINGS_KEY,
  STEAM_FIELDS,
  loadSettings,
  saveSettings,
  steamValue,
  withSteamValue,
} from './settings';

function fakeStore(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[SETTINGS_KEY, initial]]);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('settings', () => {
  it('shows the profile steps by default', () => {
    expect(loadSettings(fakeStore())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.showProfileSteps).toBe(true);
  });

  it('has the first-step workaround off by default, and reads it back when it is on', () => {
    expect(loadSettings(fakeStore()).firstStepWorkaround).toBe(false);
    expect(loadSettings(fakeStore('{"firstStepWorkaround":true}'))).toEqual({
      ...DEFAULT_SETTINGS,
      firstStepWorkaround: true,
    });
    expect(loadSettings(fakeStore('{"firstStepWorkaround":"yes"}')).firstStepWorkaround).toBe(false);
  });

  it('reads back what it saved', () => {
    const store = fakeStore();
    const settings = {
      showProfileSteps: false,
      firstStepWorkaround: true,
      steam: { ...DEFAULT_STEAM_SETTINGS, mugSmall: 162.5, referenceSeconds: 30, favourites: [20, 40, 60] },
    };
    saveSettings(settings, store);
    expect(loadSettings(store)).toEqual(settings);
  });

  it('has the steam defaults of the founder', () => {
    expect(loadSettings(fakeStore()).steam).toEqual({
      mugSmall: 150,
      mugMedium: 225,
      mugLarge: 275,
      milkPerDrink: 150,
      referenceSeconds: 26,
      referenceMilk: 180,
      favourites: [25, 50, 30],
    });
  });

  it('takes each stored steam value by itself and ignores what is not an amount', () => {
    const stored = { steam: { mugMedium: 240, mugLarge: '300', milkPerDrink: -1, referenceMilk: null, favourites: [10, 20] } };
    expect(loadSettings(fakeStore(JSON.stringify(stored))).steam).toEqual({ ...DEFAULT_STEAM_SETTINGS, mugMedium: 240 });
    expect(loadSettings(fakeStore('{"steam":7}')).steam).toEqual(DEFAULT_STEAM_SETTINGS);
    expect(loadSettings(fakeStore('{"steam":{"favourites":[10,"x",30]}}')).steam).toEqual(DEFAULT_STEAM_SETTINGS);
  });

  it('never hands out the defaults themselves', () => {
    const settings = loadSettings(fakeStore());
    settings.steam.mugSmall = 1;
    settings.steam.favourites[0] = 1;
    expect(DEFAULT_STEAM_SETTINGS.mugSmall).toBe(150);
    expect(DEFAULT_STEAM_SETTINGS.favourites).toEqual([25, 50, 30]);
  });

  it('falls back to the defaults on anything it cannot read', () => {
    expect(loadSettings(fakeStore('not json'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStore('null'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStore('{"showProfileSteps":"no","other":1}'))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('survives a store that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, broken)).not.toThrow();
  });
});

describe('the steam values of the settings page', () => {
  const fields = STEAM_FIELDS.flatMap((group) => group.fields);
  const field = (id: string) => fields.find((candidate) => candidate.id === id)!;

  it('lists every steam value once, each with a default inside its range', () => {
    expect(fields.map((entry) => entry.id)).toEqual([
      'mug-small',
      'mug-medium',
      'mug-large',
      'reference-seconds',
      'reference-milk',
      'milk-per-drink',
      'favourite-1',
      'favourite-2',
      'favourite-3',
    ]);
    expect(fields.map((entry) => steamValue(DEFAULT_STEAM_SETTINGS, entry))).toEqual([150, 225, 275, 26, 180, 150, 25, 50, 30]);
    for (const entry of fields) {
      const value = steamValue(DEFAULT_STEAM_SETTINGS, entry);
      expect(value).toBeGreaterThanOrEqual(entry.min);
      expect(value).toBeLessThanOrEqual(entry.max);
    }
  });

  it('changes one value and leaves the given settings as they were', () => {
    const changed = withSteamValue(DEFAULT_STEAM_SETTINGS, field('mug-medium'), 240.5);
    expect(changed).toEqual({ ...DEFAULT_STEAM_SETTINGS, mugMedium: 240.5 });
    expect(withSteamValue(changed, field('favourite-2'), 45).favourites).toEqual([25, 45, 30]);
    expect(DEFAULT_STEAM_SETTINGS.mugMedium).toBe(225);
    expect(DEFAULT_STEAM_SETTINGS.favourites).toEqual([25, 50, 30]);
  });

  it('holds a value inside its range and its step', () => {
    // No calibration with 0 g of milk: the timer would divide by it.
    expect(withSteamValue(DEFAULT_STEAM_SETTINGS, field('reference-milk'), 0).referenceMilk).toBe(1);
    expect(withSteamValue(DEFAULT_STEAM_SETTINGS, field('mug-large'), 5000).mugLarge).toBe(1000);
    expect(withSteamValue(DEFAULT_STEAM_SETTINGS, field('reference-seconds'), 26.4).referenceSeconds).toBe(26);
    expect(withSteamValue(DEFAULT_STEAM_SETTINGS, field('mug-small'), 162.54).mugSmall).toBe(162.5);
  });

  it('is saved and read back through the store', () => {
    const store = fakeStore();
    const steam = withSteamValue(DEFAULT_STEAM_SETTINGS, field('favourite-3'), 35);
    saveSettings({ ...DEFAULT_SETTINGS, steam }, store);
    expect(steamValue(loadSettings(store).steam, field('favourite-3'))).toBe(35);
    expect(JSON.parse(store.getItem(SETTINGS_KEY)!).steam.favourites).toEqual([25, 50, 35]);
  });
});
