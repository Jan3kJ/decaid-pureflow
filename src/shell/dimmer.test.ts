import { describe, expect, it } from 'vitest';
import type { DecaidClient, DisplayState } from '../api';
import { Dimmer, SLEEP_BRIGHTNESS } from './dimmer';

// The screen dims while the machine sleeps, only where Decaid says the platform can.

function display(brightness: boolean) {
  const set: number[] = [];
  const client = {
    getDisplay: () => Promise.resolve({ platformSupported: { brightness } } as DisplayState),
    setBrightness: (value: number) => {
      set.push(value);
      return Promise.resolve({} as DisplayState);
    },
  } satisfies Pick<DecaidClient, 'getDisplay' | 'setBrightness'>;
  return { client, set };
}

describe('the dimmer', () => {
  it('dims once when the machine sleeps and hands the brightness back when it wakes', async () => {
    const { client, set } = display(true);
    const dimmer = new Dimmer(client);
    await dimmer.follow(false);
    await dimmer.follow(true);
    await dimmer.follow(true);
    await dimmer.follow(false);
    expect(set).toEqual([SLEEP_BRIGHTNESS, 100]);
  });

  it('leaves the brightness alone where the platform cannot set it', async () => {
    const { client, set } = display(false);
    await new Dimmer(client).follow(true);
    expect(set).toEqual([]);
  });

  it('is quiet when the gateway does not answer', async () => {
    const dimmer = new Dimmer({
      getDisplay: () => Promise.reject(new Error('away')),
      setBrightness: () => Promise.reject(new Error('away')),
    });
    await expect(dimmer.follow(true)).resolves.toBeUndefined();
  });
});
