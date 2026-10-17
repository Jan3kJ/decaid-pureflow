import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_START_PROFILES,
  DEFAULT_STEAM_SETTINGS,
  PROFILE_FIELDS,
  SETTINGS_KEY,
  STEAM_FIELDS,
  loadSettings,
  profileValue,
  readAdjustments,
  readSettings,
  readStartProfiles,
  saveSettings,
  steamValue,
  withStartProfile,
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
      showGraphLegend: false,
      startProfiles: ['A-Flow / mine', null, 'A-Flow / default-dark', null, null],
      maxFlow: 12,
      defaultDose: 17.5,
      steam: { ...DEFAULT_STEAM_SETTINGS, mugSmall: 162.5, referenceSeconds: 30, favourites: [20, 40, 60] },
    };
    saveSettings(settings, store);
    expect(loadSettings(store)).toEqual(settings);
  });

  it('has a maximum flow of 8 ml/s and a default dose of 18 g, in their ranges', () => {
    const settings = loadSettings(fakeStore());
    expect(settings.maxFlow).toBe(8);
    expect(settings.defaultDose).toBe(18);
    expect(loadSettings(fakeStore('{"maxFlow":12,"defaultDose":"x"}'))).toMatchObject({ maxFlow: 12, defaultDose: 18 });
    const [flow, dose] = PROFILE_FIELDS;
    expect([flow.key, flow.min, flow.max]).toEqual(['maxFlow', 4, 20]);
    expect([dose.key, dose.min, dose.max]).toEqual(['defaultDose', 5, 30]);
    expect(profileValue(settings, flow, 25)).toBe(20);
    expect(profileValue(settings, flow, 9.94)).toBe(9.9);
    expect(profileValue(settings, dose, 2)).toBe(5);
    expect(profileValue(settings, dose)).toBe(18);
  });

  it('shows the graph legend by default', () => {
    expect(loadSettings(fakeStore()).showGraphLegend).toBe(true);
    expect(loadSettings(fakeStore('{"showGraphLegend":false}')).showGraphLegend).toBe(false);
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
      adjustments: [-8, -4, 5],
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

describe("the editor's start row (founder, 2026-10-13)", () => {
  const FLORAL = 'A-Flow / default-floral';

  it('holds the five A-Flow 3.0 defaults by default, in their order', () => {
    expect(loadSettings(fakeStore()).startProfiles).toEqual([
      'A-Flow / default-floral',
      'A-Flow / default-light',
      'A-Flow / default-medium',
      'A-Flow / default-dark',
      'A-Flow / default-46mm',
    ]);
  });

  it('saves the chosen slots and reads them back after a reload', () => {
    const store = fakeStore();
    const startProfiles = withStartProfile(DEFAULT_START_PROFILES, 1, 'A-Flow / mine');
    saveSettings({ ...DEFAULT_SETTINGS, startProfiles }, store);
    expect(JSON.parse(store.getItem(SETTINGS_KEY)!).startProfiles).toEqual(startProfiles);
    expect(loadSettings(store).startProfiles).toEqual([FLORAL, 'A-Flow / mine', 'A-Flow / default-medium', 'A-Flow / default-dark', 'A-Flow / default-46mm']);
  });

  it('keeps a title it cannot check: a profile that no longer exists stays until it is removed', () => {
    expect(loadSettings(fakeStore('{"startProfiles":["A-Flow / gone"]}')).startProfiles).toEqual(['A-Flow / gone', null, null, null, null]);
  });

  it('takes bad stored data as the defaults, or as an empty slot', () => {
    expect(loadSettings(fakeStore('{"startProfiles":"floral"}')).startProfiles).toEqual(DEFAULT_START_PROFILES);
    expect(loadSettings(fakeStore('{"startProfiles":null}')).startProfiles).toEqual(DEFAULT_START_PROFILES);
    expect(readStartProfiles([3, '', '  ', { title: FLORAL }, FLORAL])).toEqual([null, null, null, null, FLORAL]);
    expect(readStartProfiles([])).toEqual([null, null, null, null, null]);
  });

  it('holds a profile once and five at the most', () => {
    expect(readStartProfiles([FLORAL, 'b', FLORAL, 'c'])).toEqual([FLORAL, 'b', null, 'c', null]);
    expect(readStartProfiles(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e']);
    // a profile chosen for another slot leaves the one it was in
    expect(withStartProfile(DEFAULT_START_PROFILES, 4, FLORAL)).toEqual([null, 'A-Flow / default-light', 'A-Flow / default-medium', 'A-Flow / default-dark', FLORAL]);
    expect(withStartProfile(DEFAULT_START_PROFILES, 0, null)[0]).toBeNull();
    expect(DEFAULT_START_PROFILES[0]).toBe(FLORAL);
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
      'adjust-1',
      'adjust-2',
      'adjust-3',
    ]);
    expect(fields.map((entry) => steamValue(DEFAULT_STEAM_SETTINGS, entry))).toEqual([
      150, 225, 275, 26, 180, 150, 25, 50, 30, -8, -4, 5,
    ]);
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

describe('the adjust buttons of the steam page (spec 3.7)', () => {
  const field = (id: string) => STEAM_FIELDS.flatMap((group) => group.fields).find((entry) => entry.id === id)!;

  it('are -8 s, -4 s and +5 s by default, and stored and read back with the other settings', () => {
    expect(DEFAULT_STEAM_SETTINGS.adjustments).toEqual([-8, -4, 5]);
    const store = fakeStore();
    const changed = withSteamValue(DEFAULT_STEAM_SETTINGS, field('adjust-1'), -10);
    saveSettings({ ...DEFAULT_SETTINGS, steam: changed }, store);
    expect(loadSettings(store).steam.adjustments).toEqual([-10, -4, 5]);
    // The backup passes the same reading (settings-backup.ts).
    expect(readSettings({ steam: { adjustments: [-3, 2, 7] } }).steam.adjustments).toEqual([-3, 2, 7]);
  });

  it('take whole seconds from -60 to 60, below 0 too', () => {
    expect(withSteamValue(DEFAULT_STEAM_SETTINGS, field('adjust-2'), -90).adjustments).toEqual([-8, -60, 5]);
    expect(withSteamValue(DEFAULT_STEAM_SETTINGS, field('adjust-3'), 7.4).adjustments).toEqual([-8, -4, 7]);
  });

  it('fall back to the defaults when the stored ones are not three amounts in range', () => {
    for (const stored of [undefined, 'x', [1, 2], [1, 2, 3, 4], [1, 2, 99], [1, 2.5, 3], [1, '2', 3]]) {
      expect(readAdjustments(stored)).toEqual([-8, -4, 5]);
    }
    expect(readSettings({ steam: { favourites: [20, 40, 60] } }).steam).toEqual({
      ...DEFAULT_STEAM_SETTINGS,
      favourites: [20, 40, 60],
    });
  });
});
