import { describe, expect, it } from 'vitest';
import { MOVED_KEYS, moveFormerKeys } from './former-keys';
import { FORMER_NAME } from './former-name';
import { DEFAULT_SETTINGS } from './settings';
import { BACKUP_KEY, SettingsBackup } from './settings-backup';

function memoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe('the keys of the former name in localStorage', () => {
  it('are the four keys of the skin, under decaid-skin', () => {
    expect(MOVED_KEYS).toEqual([
      ['pureflow.settings', 'decaid-skin.settings'],
      ['pureflow.screen', 'decaid-skin.screen'],
      ['pureflow.settings-location', 'decaid-skin.settings-location'],
      ['pureflow.sensor-calibration-previous', 'decaid-skin.sensor-calibration-previous'],
    ]);
  });

  it('move to the new keys and are removed', () => {
    const store = memoryStore({ 'decaid-skin.settings': '{"maxFlow":6}', 'decaid-skin.screen': 'editor', other: 'kept' });
    moveFormerKeys(store);
    expect(Object.fromEntries(store.items)).toEqual({ 'pureflow.settings': '{"maxFlow":6}', 'pureflow.screen': 'editor', other: 'kept' });
  });

  it('do not replace a value under the new key', () => {
    const store = memoryStore({ 'decaid-skin.settings': '{"maxFlow":6}', 'pureflow.settings': '{"maxFlow":9}' });
    moveFormerKeys(store);
    expect(Object.fromEntries(store.items)).toEqual({ 'pureflow.settings': '{"maxFlow":9}' });
  });

  it('leave a store without them alone, and a store that throws', () => {
    const store = memoryStore({ 'pureflow.screen': 'home' });
    moveFormerKeys(store);
    expect(Object.fromEntries(store.items)).toEqual({ 'pureflow.screen': 'home' });
    const broken = { getItem: () => { throw new Error('denied'); }, setItem() {}, removeItem() {} };
    expect(() => moveFormerKeys(broken)).not.toThrow();
  });
});

/** A KV store of several namespaces; the client's default namespace is the skin's. */
function kvGateway(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const at = (key: string, namespace = 'pureflow') => `${namespace}/${key}`;
  return {
    store,
    failWrite: false,
    async kvGet(key: string, namespace?: string) {
      return store[at(key, namespace)] ?? null;
    },
    async kvSet(key: string, value: unknown, namespace?: string) {
      if (this.failWrite) throw new Error('gateway away');
      store[at(key, namespace)] = value;
    },
  };
}

describe('the backup under the former name', () => {
  const former = { savedAt: '2026-10-15T06:48:00.000Z', version: '0.2.0', settings: { ...DEFAULT_SETTINGS, maxFlow: 6 } };
  const backup = (gateway: ReturnType<typeof kvGateway>) => new SettingsBackup(gateway, '0.2.0', () => {});

  it('is read and copied to the new namespace when the new one has none', async () => {
    const gateway = kvGateway({ [`${FORMER_NAME}/${BACKUP_KEY}`]: former });
    expect(await backup(gateway).read()).toEqual({ savedAt: former.savedAt, settings: former.settings });
    expect(gateway.store[`pureflow/${BACKUP_KEY}`]).toEqual(former);
  });

  it('is not read when the new namespace holds a backup', async () => {
    const current = { ...former, settings: { ...DEFAULT_SETTINGS, maxFlow: 9 } };
    const gateway = kvGateway({ [`${FORMER_NAME}/${BACKUP_KEY}`]: former, [`pureflow/${BACKUP_KEY}`]: current });
    expect((await backup(gateway).read())?.settings.maxFlow).toBe(9);
  });

  it('is still read when the copy fails', async () => {
    const gateway = kvGateway({ [`${FORMER_NAME}/${BACKUP_KEY}`]: former });
    gateway.failWrite = true;
    expect((await backup(gateway).read())?.settings.maxFlow).toBe(6);
    expect(gateway.store[`pureflow/${BACKUP_KEY}`]).toBeUndefined();
  });

  it('gives null when neither namespace holds one', async () => {
    expect(await backup(kvGateway()).read()).toBeNull();
  });
});
