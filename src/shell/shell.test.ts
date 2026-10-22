import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState, ShotSettings } from '../api';
import { gatewayBaseUrl } from './gateway';
import {
  FRAME_STALE_MS,
  canSleep,
  canStop,
  gatewayAfter,
  heatingStatus,
  isAsleep,
  isHeating,
  linkOf,
  stateLabel,
  stateLine,
  statusOf,
} from './machine';
import { SCREEN_KEY, followMachine, loadScreen, saveScreen } from './nav';

function frame(state: MachineState, over: Partial<MachineSnapshot> = {}): MachineSnapshot {
  return {
    timestamp: '2026-10-13T06:37:17.000000',
    state: { state, substate: 'idle' },
    flow: 0,
    pressure: 0,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature: 90,
    groupTemperature: 91.26,
    targetMixTemperature: 93,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 150,
    ...over,
  };
}

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('gatewayBaseUrl', () => {
  it('is port 8080 on the page host', () => {
    expect(gatewayBaseUrl({ protocol: 'http:', hostname: 'localhost', search: '' })).toBe('http://localhost:8080');
    expect(gatewayBaseUrl({ protocol: 'http:', hostname: '192.168.1.20', search: '' })).toBe('http://192.168.1.20:8080');
  });

  it('falls back to localhost for a page without a host', () => {
    expect(gatewayBaseUrl({ protocol: 'file:', hostname: '', search: '' })).toBe('http://localhost:8080');
  });

  it('takes another gateway from the address, and only an http one', () => {
    expect(gatewayBaseUrl({ protocol: 'http:', hostname: 'localhost', search: '?gateway=http://tablet:8080/' })).toBe(
      'http://tablet:8080',
    );
    expect(gatewayBaseUrl({ protocol: 'http:', hostname: 'localhost', search: '?gateway=javascript:1' })).toBe(
      'http://localhost:8080',
    );
  });
});

describe('the screen', () => {
  it('is restored from localStorage, home by default', () => {
    expect(loadScreen(memoryStore())).toBe('home');
    expect(loadScreen(memoryStore({ [SCREEN_KEY]: 'profiles' }))).toBe('profiles');
    expect(loadScreen(memoryStore({ [SCREEN_KEY]: 'no-such-screen' }))).toBe('home');
    // The scale page is gone (spec 3.7): a skin that showed it opens home.
    expect(loadScreen(memoryStore({ [SCREEN_KEY]: 'scale' }))).toBe('home');
  });

  it('opens home for the espresso screen a skin before 0.3 stored: the shot is an overlay now', () => {
    expect(loadScreen(memoryStore({ [SCREEN_KEY]: 'espresso' }))).toBe('home');
  });

  it('is saved under one key', () => {
    const store = memoryStore();
    saveScreen('editor', store);
    expect(store.getItem(SCREEN_KEY)).toBe('editor');
    expect(loadScreen(store)).toBe('editor');
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadScreen(broken)).toBe('home');
    expect(() => saveScreen('home', broken)).not.toThrow();
  });
});

describe('followMachine', () => {
  it('opens home, which shows the shot, when the machine enters espresso, from any screen', () => {
    expect(followMachine('home', 'idle', 'espresso')).toBe('home');
    expect(followMachine('editor', 'idle', 'espresso')).toBe('home');
    expect(followMachine('steam', 'idle', 'espresso')).toBe('home');
  });

  it('opens it when the skin loads in the middle of a shot', () => {
    expect(followMachine('profiles', undefined, 'espresso')).toBe('home');
  });

  it('leaves the screen alone when the machine leaves espresso, and during the shot', () => {
    expect(followMachine('home', 'espresso', 'idle')).toBe('home');
    expect(followMachine('profiles', 'espresso', 'idle')).toBe('profiles');
    expect(followMachine('steam', 'espresso', 'espresso')).toBe('steam');
  });

  it('does nothing on other changes of state', () => {
    expect(followMachine('editor', 'idle', 'steam')).toBe('editor');
    expect(followMachine('home', 'sleeping', 'idle')).toBe('home');
  });
});

describe('the link to the machine', () => {
  it('is not known before the stream opened or failed', () => {
    expect(gatewayAfter('connecting', 'connecting')).toBe('connecting');
    expect(linkOf('connecting', null, null, 0)).toBe('connecting');
  });

  it('has no gateway when the socket does not open, also between two attempts', () => {
    expect(gatewayAfter('connecting', 'waiting')).toBe('lost');
    expect(gatewayAfter('lost', 'connecting')).toBe('lost');
    expect(linkOf('lost', 1000, 1500, 2000)).toBe('no-gateway');
  });

  it('is refused when the stream failed, until it opens again', () => {
    expect(gatewayAfter('connected', 'failed')).toBe('refused');
    expect(gatewayAfter('refused', 'connecting')).toBe('refused');
    expect(gatewayAfter('refused', 'waiting')).toBe('lost');
    expect(gatewayAfter('refused', 'open')).toBe('connected');
    expect(linkOf('refused', 1000, 1500, 1600)).toBe('refused');
  });

  it('has a machine while frames arrive', () => {
    expect(gatewayAfter('lost', 'open')).toBe('connected');
    expect(linkOf('connected', 1000, 1200, 1200 + FRAME_STALE_MS)).toBe('machine');
  });

  it('has no machine when the open socket is silent', () => {
    expect(linkOf('connected', 1000, null, 1000 + FRAME_STALE_MS)).toBe('connecting');
    expect(linkOf('connected', 1000, null, 1001 + FRAME_STALE_MS)).toBe('no-machine');
    expect(linkOf('connected', 1000, 1200, 1201 + FRAME_STALE_MS)).toBe('no-machine');
  });

  it('does not count a frame from before a reconnect', () => {
    expect(linkOf('connected', 5000, 1200, 5100)).toBe('connecting');
    expect(linkOf('connected', 5000, 1200, 5001 + FRAME_STALE_MS)).toBe('no-machine');
  });
});

describe('heating (spec 3.8)', () => {
  const url = 'http://localhost:8080';
  const settings = (targetSteamTemp: number): ShotSettings => ({
    steamSetting: 0,
    targetSteamTemp,
    targetSteamDuration: 50,
    targetHotWaterTemp: 75,
    targetHotWaterVolume: 50,
    targetHotWaterDuration: 30,
    targetShotVolume: 36,
    groupTemp: 93,
  });

  it('on home: heating until the group is 3 °C under its target', () => {
    expect(isHeating(frame('idle', { groupTemperature: 89.9 }), 'group', null)).toBe(true);
    expect(isHeating(frame('idle', { groupTemperature: 90 }), 'group', null)).toBe(false);
    expect(isHeating(frame('idle', { groupTemperature: 92.6 }), 'group', null)).toBe(false);
  });

  it('on the steam page: heating until the steam heater is 3 °C under the steam target of the machine', () => {
    expect(isHeating(frame('idle', { steamTemperature: 146.9 }), 'steam', settings(150))).toBe(true);
    expect(isHeating(frame('idle', { steamTemperature: 147 }), 'steam', settings(150))).toBe(false);
    // the group's temperature does not count on the steam page, nor the steam's on home
    expect(isHeating(frame('idle', { groupTemperature: 60, steamTemperature: 150 }), 'steam', settings(150))).toBe(false);
    expect(isHeating(frame('idle', { groupTemperature: 93, steamTemperature: 60 }), 'group', settings(150))).toBe(false);
  });

  it('a steam heater that is off or not known is not heating', () => {
    expect(isHeating(frame('idle', { steamTemperature: 40 }), 'steam', settings(0))).toBe(false);
    expect(isHeating(frame('idle', { steamTemperature: 40 }), 'steam', null)).toBe(false);
  });

  it('only an idle machine is shown as heating', () => {
    expect(isHeating(frame('espresso', { groupTemperature: 80 }), 'group', null)).toBe(false);
    expect(isHeating(frame('sleeping', { groupTemperature: 30 }), 'group', null)).toBe(false);
    expect(isHeating(frame('steam', { steamTemperature: 120 }), 'steam', settings(150))).toBe(false);
    expect(isHeating(null, 'group', null)).toBe(false);
  });

  it('says Heating with the tone busy in place of Idle', () => {
    const cold = frame('idle', { groupTemperature: 70 });
    expect(heatingStatus(statusOf('machine', cold, url), 'machine', cold, 'group', null)).toMatchObject({
      title: 'Heating',
      tone: 'busy',
    });
    const warm = frame('idle', { groupTemperature: 92 });
    expect(heatingStatus(statusOf('machine', warm, url), 'machine', warm, 'group', null)).toMatchObject({
      title: 'Idle',
      tone: 'ok',
    });
    // without a fresh frame the link's status stands
    expect(heatingStatus(statusOf('no-machine', cold, url), 'no-machine', cold, 'group', null).title).toBe('No machine connected');
  });
});

describe('statusOf', () => {
  const url = 'http://localhost:8080';

  it('names the gateway when it does not answer', () => {
    const status = statusOf('no-gateway', frame('idle'), url);
    expect(status.title).toBe('Decaid is not reachable');
    expect(status.detail).toContain(url);
    expect(status.tone).toBe('warn');
  });

  it('says that Decaid closed the connection, without a promise to try again', () => {
    const status = statusOf('refused', frame('idle'), url);
    expect(status.title).toBe('Decaid closed the connection');
    expect(status.detail).not.toContain('Trying again');
    expect(status.tone).toBe('warn');
  });

  it('says that no machine is connected, whatever the last frame was', () => {
    expect(statusOf('no-machine', frame('espresso'), url).title).toBe('No machine connected');
    expect(statusOf('machine', null, url).title).toBe('No machine connected');
  });

  it('shows the state the machine sent, with the group temperature', () => {
    expect(statusOf('machine', frame('idle'), url)).toEqual({
      title: 'Idle',
      detail: 'group 91.3 °C, set to 93 °C',
      tone: 'ok',
    });
    expect(statusOf('machine', frame('sleeping'), url)).toMatchObject({ title: 'Asleep', tone: 'off' });
    expect(statusOf('machine', frame('espresso'), url)).toMatchObject({ title: 'Espresso', tone: 'busy' });
    expect(statusOf('machine', frame('needsWater'), url)).toMatchObject({ title: 'Needs water', tone: 'warn' });
  });

  it('shows a state it does not know as the machine names it', () => {
    expect(stateLabel('somethingNew')).toBe('somethingNew');
  });
});

describe('canStop', () => {
  it('stops what runs, and starts nothing: the DE1 is started at the machine', () => {
    expect(canStop('machine', frame('espresso'))).toBe(true);
    expect(canStop('machine', frame('steam'))).toBe(true);
    expect(canStop('machine', frame('idle'))).toBe(false);
    expect(canStop('machine', frame('sleeping'))).toBe(false);
    expect(canStop('machine', frame('heating'))).toBe(false);
  });

  it('offers nothing without a machine', () => {
    expect(canStop('no-machine', frame('steam'))).toBe(false);
    expect(canStop('no-gateway', frame('espresso'))).toBe(false);
    expect(canStop('connecting', null)).toBe(false);
  });
});

describe('stateLine', () => {
  const water = { currentLevel: 34.6, refillLevel: 5 };
  const text = (values: ReturnType<typeof stateLine>) => values.map((v) => `${v.label} ${v.value}${v.warn ? '!' : ''}`);

  it('reads every value from the streams', () => {
    expect(text(stateLine('machine', frame('idle'), water, 'connected', 34))).toEqual([
      'group 91.3 °C',
      'steam 150 °C',
      'tank 35 mm',
      'scale 34.0 g',
    ]);
  });

  it('warns in place of the weight when the scale is not connected', () => {
    expect(text(stateLine('machine', frame('idle'), water, 'disconnected', null)).at(-1)).toBe('scale not connected, tap to retry!');
    expect(text(stateLine('machine', frame('idle'), water, 'unknown', null)).at(-1)).toBe('scale not connected, tap to retry!');
    expect(text(stateLine('machine', frame('idle'), water, 'disconnected', null, true)).at(-1)).toBe('scale looking for it!');
  });

  it('warns when the tank is under its refill level', () => {
    expect(text(stateLine('machine', frame('idle'), { currentLevel: 3, refillLevel: 5 }, 'connected', 0))[2]).toBe('tank 3 mm!');
  });

  it('assumes nothing without a fresh frame or a level', () => {
    expect(text(stateLine('no-machine', frame('idle'), water, 'connected', 0)).slice(0, 3)).toEqual(['group –', 'steam –', 'tank –']);
    expect(text(stateLine('machine', frame('idle'), null, 'connected', 0))[2]).toBe('tank –');
  });
});

describe('sleep', () => {
  it('is offered for a machine that is awake and runs nothing', () => {
    expect(canSleep('machine', frame('idle'))).toBe(true);
    expect(canSleep('machine', frame('heating'))).toBe(true);
    expect(canSleep('machine', frame('sleeping'))).toBe(false);
    expect(canSleep('machine', frame('espresso'))).toBe(false);
    expect(canSleep('machine', frame('steam'))).toBe(false);
    expect(canSleep('no-machine', frame('idle'))).toBe(false);
    expect(canSleep('machine', null)).toBe(false);
  });

  it('is only what the machine said itself', () => {
    expect(isAsleep('machine', frame('sleeping'))).toBe(true);
    expect(isAsleep('machine', frame('idle'))).toBe(false);
    // An old frame of a machine that is away says nothing.
    expect(isAsleep('no-machine', frame('sleeping'))).toBe(false);
    expect(isAsleep('refused', frame('sleeping'))).toBe(false);
    expect(isAsleep('machine', null)).toBe(false);
  });
});
