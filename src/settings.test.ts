import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_STEAM_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from './settings';

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
