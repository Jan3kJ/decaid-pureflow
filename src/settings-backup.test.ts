import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_START_PROFILES, DEFAULT_STEAM_SETTINGS, hasSettings, SETTINGS_KEY } from './settings';
import {
  BACKUP_DEBOUNCE_MS,
  BACKUP_KEY,
  SettingsBackup,
  atStart,
  backupOf,
  backupTime,
  readBackup,
  type Written,
} from './settings-backup';

const NOW = new Date('2026-10-15T06:48:00.000Z');
const CHANGED = { ...DEFAULT_SETTINGS, firstStepWorkaround: true, steam: { ...DEFAULT_STEAM_SETTINGS, mugSmall: 160 } };

/** A KV store of one namespace, as the client's methods see it. */
function fakeGateway(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    store,
    fail: false,
    writes: 0,
    kvGet(key: string) {
      if (this.fail) return Promise.reject(new Error('gateway away'));
      return Promise.resolve(store[key] ?? null);
    },
    kvSet(key: string, value: unknown) {
      if (this.fail) return Promise.reject(new Error('gateway away'));
      this.writes += 1;
      store[key] = JSON.parse(JSON.stringify(value));
      return Promise.resolve();
    },
  };
}

describe('the backup of the settings', () => {
  it('holds the settings, the time and the skin version', () => {
    expect(backupOf(CHANGED, '0.1.1', NOW)).toEqual({ savedAt: '2026-10-15T06:48:00.000Z', version: '0.1.1', settings: CHANGED });
    expect(BACKUP_KEY).toBe('settings-backup');
  });

  it('reads back what it wrote', async () => {
    const gateway = fakeGateway();
    const backup = new SettingsBackup(
      gateway,
      '0.1.1',
      () => {},
      () => NOW,
    );
    await backup.write(CHANGED);
    expect(gateway.store[BACKUP_KEY]).toEqual({ savedAt: NOW.toISOString(), version: '0.1.1', settings: CHANGED });
    expect(await backup.read()).toEqual({ savedAt: NOW.toISOString(), settings: CHANGED });
  });

  it('is no backup without a key or without settings', () => {
    for (const value of [null, undefined, 'text', 42, [], {}, { savedAt: NOW.toISOString() }, { settings: 'x' }, { settings: [] }]) {
      expect(readBackup(value)).toBeNull();
    }
  });

  it('takes bad or old data field by field, as stored settings', () => {
    const read = readBackup({
      savedAt: 'yesterday',
      version: '0.0.9',
      settings: {
        firstStepWorkaround: true,
        showGraphLegend: 'no',
        startProfiles: ['light', 7, 'light'],
        steam: { mugSmall: 160, mugLarge: -3, favourites: [1, 2] },
        removedLongAgo: 1,
      },
    });
    expect(read).toEqual({
      savedAt: null,
      settings: {
        ...DEFAULT_SETTINGS,
        firstStepWorkaround: true,
        startProfiles: ['light', null, null, null, null],
        steam: { ...DEFAULT_STEAM_SETTINGS, mugSmall: 160 },
      },
    });
    // a backup of an older skin without the start row gets the defaults' row
    expect(readBackup({ settings: { showProfileSteps: false } })?.settings).toEqual({
      ...DEFAULT_SETTINGS,
      showProfileSteps: false,
      startProfiles: DEFAULT_START_PROFILES,
    });
  });

  it('shows its time in local time', () => {
    const local = new Date(2026, 9, 15, 6, 8);
    expect(backupTime(local.toISOString())).toBe('2026-10-15 06:08');
  });
});

describe('writing the backup after a save', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits until the settings stay unchanged, then writes the last ones once', async () => {
    const gateway = fakeGateway();
    const written: Written[] = [];
    const backup = new SettingsBackup(
      gateway,
      '0.1.1',
      (entry) => written.push(entry),
      () => NOW,
    );
    backup.schedule(DEFAULT_SETTINGS);
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS - 100);
    backup.schedule(CHANGED);
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS - 100);
    expect(gateway.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(gateway.writes).toBe(1);
    expect((gateway.store[BACKUP_KEY] as { settings: unknown }).settings).toEqual(CHANGED);
    expect(written).toEqual([{ savedAt: NOW.toISOString() }]);
  });

  it('reports a failed write and does not throw', async () => {
    const gateway = fakeGateway();
    gateway.fail = true;
    const written: Written[] = [];
    const backup = new SettingsBackup(
      gateway,
      '0.1.1',
      (entry) => written.push(entry),
      () => NOW,
    );
    backup.schedule(CHANGED);
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS);
    expect(written).toEqual([{ error: 'gateway away' }]);
  });

  it('writes nothing after a cancel', async () => {
    const gateway = fakeGateway();
    const backup = new SettingsBackup(
      gateway,
      '0.1.1',
      () => {},
      () => NOW,
    );
    backup.schedule(CHANGED);
    backup.cancel();
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS * 2);
    expect(gateway.writes).toBe(0);
  });
});

describe('the backup at the start', () => {
  const backup = { savedAt: NOW.toISOString(), settings: CHANGED };

  it('restores it when localStorage holds no settings', () => {
    expect(atStart(false, false, backup, DEFAULT_SETTINGS)).toBe('restore');
    expect(atStart(false, false, null, DEFAULT_SETTINGS)).toBeNull();
  });

  it('never restores over settings that are stored or were changed since the start', () => {
    expect(atStart(true, false, backup, DEFAULT_SETTINGS)).toBe('write');
    expect(atStart(false, true, backup, DEFAULT_SETTINGS)).toBeNull();
  });

  it('writes one when there is none or it differs from the stored settings', () => {
    expect(atStart(true, false, null, CHANGED)).toBe('write');
    expect(atStart(true, false, backup, CHANGED)).toBeNull();
  });

  it('knows whether localStorage holds settings', () => {
    const data = new Map<string, string>();
    const store = { getItem: (key: string) => data.get(key) ?? null };
    expect(hasSettings(store)).toBe(false);
    data.set(SETTINGS_KEY, '{}');
    expect(hasSettings(store)).toBe(true);
    expect(
      hasSettings({
        getItem: () => {
          throw new Error('no storage');
        },
      }),
    ).toBe(false);
  });
});
