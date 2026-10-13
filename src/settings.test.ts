import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from './settings';

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
      showProfileSteps: true,
      firstStepWorkaround: true,
    });
    expect(loadSettings(fakeStore('{"firstStepWorkaround":"yes"}')).firstStepWorkaround).toBe(false);
  });

  it('reads back what it saved', () => {
    const store = fakeStore();
    saveSettings({ showProfileSteps: false, firstStepWorkaround: true }, store);
    expect(loadSettings(store)).toEqual({ showProfileSteps: false, firstStepWorkaround: true });
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
