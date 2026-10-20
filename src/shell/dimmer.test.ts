import { describe, expect, it } from 'vitest';
import type { DecaidSettings, DisplayState } from '../api';
import { APP_SLEEP_BRIGHTNESS, APP_SLEEP_KEY, Dimmer, SLEEP_BRIGHTNESS } from './dimmer';

// The screen dims while the machine sleeps, only where Decaid says the platform can. The app's
// sleep dims to 0 and releases Decaid's wake lock until the wake.

function memoryStore() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

function display(brightness: boolean, { wakeLock = true, keepAwake = true, wakeLockOverride = false } = {}) {
  const set: number[] = [];
  /** every request, in order */
  const sent: string[] = [];
  const store = memoryStore();
  const client = {
    getDisplay: () => {
      sent.push('GET display');
      return Promise.resolve({ wakeLockOverride, platformSupported: { brightness, wakeLock } } as DisplayState);
    },
    setBrightness: (value: number) => {
      set.push(value);
      sent.push(`brightness ${value}`);
      return Promise.resolve({} as DisplayState);
    },
    setWakeLock: (on: boolean) => {
      wakeLockOverride = on;
      sent.push(`wakelock ${on ? 'POST' : 'DELETE'}`);
      return Promise.resolve({} as DisplayState);
    },
    getSettings: () => {
      sent.push('GET settings');
      return Promise.resolve({ keepAwake } as DecaidSettings);
    },
    updateSettings: (patch: Partial<DecaidSettings>) => {
      keepAwake = patch.keepAwake ?? keepAwake;
      sent.push(`keepAwake ${patch.keepAwake}`);
      return Promise.resolve();
    },
  } satisfies ConstructorParameters<typeof Dimmer>[0];
  return { client, set, sent, store, now: () => ({ keepAwake, wakeLockOverride }) };
}

describe('the dimmer', () => {
  it('dims once when the machine sleeps and hands the brightness back when it wakes', async () => {
    const { client, set } = display(true);
    const dimmer = new Dimmer(client, memoryStore());
    await dimmer.follow(false);
    await dimmer.follow(true);
    await dimmer.follow(true);
    await dimmer.follow(false);
    expect(set).toEqual([SLEEP_BRIGHTNESS, 100]);
  });

  it('leaves the brightness alone where the platform cannot set it', async () => {
    const { client, set } = display(false);
    await new Dimmer(client, memoryStore()).follow(true);
    expect(set).toEqual([]);
  });

  it('is quiet when the gateway does not answer', async () => {
    const away = () => Promise.reject(new Error('away'));
    const dimmer = new Dimmer(
      { getDisplay: away, setBrightness: away, setWakeLock: away, getSettings: away, updateSettings: away },
      memoryStore(),
    );
    await expect(dimmer.follow(true)).resolves.toBeUndefined();
  });

  it("the app's sleep dims to 0 and releases the wake lock; the wake puts both back", async () => {
    const { client, sent, store, now } = display(true, { keepAwake: true, wakeLockOverride: true });
    const dimmer = new Dimmer(client, store);
    await dimmer.follow(false);
    dimmer.sleepApp();
    await dimmer.follow(true);
    expect(now()).toEqual({ keepAwake: false, wakeLockOverride: false });
    expect(JSON.parse(store.items.get(APP_SLEEP_KEY)!)).toEqual({ keepAwake: true, wakeLockOverride: true });
    await dimmer.follow(true);
    await dimmer.follow(false);
    expect(sent).toEqual([
      'GET display',
      'GET settings',
      'wakelock DELETE',
      'keepAwake false',
      `brightness ${APP_SLEEP_BRIGHTNESS}`,
      'GET display',
      'keepAwake true',
      'wakelock POST',
      'brightness 100',
    ]);
    expect(now()).toEqual({ keepAwake: true, wakeLockOverride: true });
    expect(store.items.has(APP_SLEEP_KEY)).toBe(false);

    // The next sleep is the machine's alone again.
    sent.length = 0;
    await dimmer.follow(true);
    expect(sent).toEqual(['GET display', `brightness ${SLEEP_BRIGHTNESS}`]);
  });

  it('switches off only what holds the lock, and nothing when Decaid lets it go by itself', async () => {
    const one = display(true, { keepAwake: true });
    const dimmer = new Dimmer(one.client, one.store);
    dimmer.sleepApp();
    await dimmer.follow(true);
    await dimmer.follow(false);
    expect(one.sent.filter((call) => !call.startsWith('GET'))).toEqual([
      'keepAwake false',
      'brightness 0',
      'keepAwake true',
      'brightness 100',
    ]);

    const none = display(true, { keepAwake: false });
    const quiet = new Dimmer(none.client, none.store);
    quiet.sleepApp();
    await quiet.follow(true);
    await quiet.follow(false);
    expect(none.sent.filter((call) => !call.startsWith('GET'))).toEqual(['brightness 0', 'brightness 100']);
  });

  it('leaves the wake lock and the brightness alone where the platform has neither', async () => {
    const { client, sent, store } = display(false, { wakeLock: false });
    const dimmer = new Dimmer(client, store);
    dimmer.sleepApp();
    await dimmer.follow(true);
    await dimmer.follow(false);
    expect(sent).toEqual(['GET display', 'GET display']);
  });

  it('a cancelled app sleep leaves the next sleep to the machine alone', async () => {
    const { client, set, sent, store } = display(true);
    const dimmer = new Dimmer(client, store);
    dimmer.sleepApp();
    dimmer.cancelApp();
    await dimmer.follow(true);
    expect(set).toEqual([SLEEP_BRIGHTNESS]);
    expect(sent).not.toContain('keepAwake false');
  });

  it('puts the wake lock back after a reload while the app slept', async () => {
    const { client, sent, store, now } = display(true, { keepAwake: false });
    store.setItem(APP_SLEEP_KEY, JSON.stringify({ keepAwake: true, wakeLockOverride: false }));
    const dimmer = new Dimmer(client, store);
    await dimmer.follow(false);
    expect(now().keepAwake).toBe(true);
    expect(sent).toEqual(['GET display', 'keepAwake true', 'brightness 100']);
    expect(store.items.has(APP_SLEEP_KEY)).toBe(false);
    // Once only.
    await dimmer.follow(false);
    expect(sent).toHaveLength(3);
  });
});
