import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings } from '../settings';
import { BACKUP_DEBOUNCE_MS, BACKUP_KEY, type BackupGateway } from '../settings-backup';
import { SettingsStore } from './settings-store.svelte';

// The settings part of the skin: stored at once, backed up a moment later, and taken from the
// backup at a start without settings.

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

/** A KV store in memory; `fail` makes every call throw, as a gateway that is away. */
function kv(stored: Record<string, unknown> = {}) {
  const writes: { key: string; value: unknown }[] = [];
  const state = { fail: false };
  const gateway: BackupGateway = {
    kvGet: (key) => (state.fail ? Promise.reject(new Error('away')) : Promise.resolve(stored[key] ?? null)),
    kvSet: (key, value) => {
      if (state.fail) return Promise.reject(new Error('away'));
      writes.push({ key, value });
      return Promise.resolve();
    },
  };
  return { gateway, writes, state };
}

const backupOf = (settings: Settings, savedAt = '2026-10-19T08:00:00.000Z') => ({ version: '0.3.0', savedAt, settings });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the settings store', () => {
  it('stores a change at once and writes one backup a moment later', async () => {
    const { gateway, writes } = kv();
    const store = new SettingsStore(gateway);
    store.set({ defaultDose: 17 });
    store.set({ defaultDose: 19 });
    expect(store.settings.defaultDose).toBe(19);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ defaultDose: 19 });
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ key: BACKUP_KEY, value: { settings: { defaultDose: 19 } } });
    expect(store.backupAt).not.toBeNull();
    expect(store.backupError).toBeNull();
  });

  it('says why a backup was not written', async () => {
    const { gateway, state } = kv();
    const store = new SettingsStore(gateway);
    state.fail = true;
    store.set({ defaultDose: 17 });
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS);
    expect(store.backupError).toBe('The backup in Decaid was not written: away');
  });

  it('takes the backup at a start without settings, and says so once', async () => {
    const backup = backupOf({ ...DEFAULT_SETTINGS, defaultDose: 21 });
    const store = new SettingsStore(kv({ [BACKUP_KEY]: backup }).gateway);
    await store.readAtStart();
    expect(store.settings.defaultDose).toBe(21);
    expect(store.restoredFrom).toBe(backup.savedAt);
    expect(store.backupAt).toBe(backup.savedAt);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ defaultDose: 21 });
  });

  it('keeps the settings of localStorage and backs them up when they differ', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, defaultDose: 16 }));
    const { gateway, writes } = kv({ [BACKUP_KEY]: backupOf({ ...DEFAULT_SETTINGS, defaultDose: 21 }) });
    const store = new SettingsStore(gateway);
    await store.readAtStart();
    expect(store.settings.defaultDose).toBe(16);
    expect(store.restoredFrom).toBeNull();
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS);
    expect(writes).toHaveLength(1);
  });

  it('reads the backup again at the next open when the gateway was away', async () => {
    const { gateway, state } = kv({ [BACKUP_KEY]: backupOf({ ...DEFAULT_SETTINGS, defaultDose: 21 }) });
    const store = new SettingsStore(gateway);
    state.fail = true;
    await store.readAtStart();
    expect(store.settings.defaultDose).toBe(DEFAULT_SETTINGS.defaultDose);
    state.fail = false;
    await store.readAtStart();
    expect(store.settings.defaultDose).toBe(21);
  });

  it("restores the backup's settings on request, and null without a backup", async () => {
    expect(await new SettingsStore(kv().gateway).restore()).toBeNull();
    const backup = backupOf({ ...DEFAULT_SETTINGS, defaultDose: 20 });
    const { gateway, writes } = kv({ [BACKUP_KEY]: backup });
    const store = new SettingsStore(gateway);
    store.set({ defaultDose: 15 });
    expect((await store.restore())?.settings.defaultDose).toBe(20);
    expect(store.settings.defaultDose).toBe(20);
    expect(store.backupAt).toBe(backup.savedAt);
    // The change before the restore is not written over the backup.
    await vi.advanceTimersByTimeAsync(BACKUP_DEBOUNCE_MS);
    expect(writes).toEqual([]);
  });
});
