import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Skin } from './skin.svelte';

// The tap on the weight in the state line calls `Skin.tare` (spec 3.7, acceptance item 21);
// the steam and hot water pages' tare buttons call the same function.

const GATEWAY = 'http://rig:8080';

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

let calls: { method: string; url: string }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url });
    return new Response(null, { status: 200 });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('tare', () => {
  it('tares a connected scale with one PUT', async () => {
    const skin = new Skin(GATEWAY);
    skin.scaleLink = 'connected';
    await skin.tare();
    expect(calls).toEqual([{ method: 'PUT', url: `${GATEWAY}/api/v1/scale/tare` }]);
    expect(skin.notice).toBeNull();
    expect(skin.info).toBeNull();
  });

  it('does nothing without a connected scale', async () => {
    for (const link of ['disconnected', 'unknown'] as const) {
      const skin = new Skin(GATEWAY);
      skin.scaleLink = link;
      skin.notice = 'earlier';
      await skin.tare();
      expect(skin.notice).toBe('earlier');
    }
    expect(calls).toEqual([]);
  });

  it('a tare Decaid blocks during a shot is a notice, not an error', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ type: 'block_tare_during_shot', details: 'A shot is brewing' }, { status: 400 }),
    );
    const skin = new Skin(GATEWAY);
    skin.scaleLink = 'connected';
    await skin.tare();
    expect(skin.info).toContain('No tare while a shot runs');
    expect(skin.notice).toBeNull();
  });
});
