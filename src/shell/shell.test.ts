import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState, ShotSettings } from '../api';
import { gatewayBaseUrl } from './gateway';
import {
  FRAME_STALE_MS,
  canSleep,
  canStop,
  gatewayAfter,
  HEATER_OFF,
  heatingStatus,
  isAsleep,
  heaterWord,
  linkOf,
  stateLabel,
  stateLine,
  statusOf,
  type HeaterWord,
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

  const word = (f: MachineSnapshot, target: 'group' | 'steam', steam: number | null, before: HeaterWord | null = null) =>
    heaterWord(f, target, steam === null ? null : settings(steam), before);
  const status = (f: MachineSnapshot, w: HeaterWord | null) => heatingStatus(statusOf('machine', f, url), 'machine', w);

  it('home and hot water: Heating more than 3 °C under the group target, else Idle', () => {
    expect(word(frame('idle', { groupTemperature: 89.9 }), 'group', null)).toBe('heating');
    expect(word(frame('idle', { groupTemperature: 90 }), 'group', null)).toBe('heated');
    expect(word(frame('idle', { groupTemperature: 92.6 }), 'group', null)).toBe('heated');
    expect(word(frame('idle', { groupTemperature: 97 }), 'group', null)).toBe('heated');
    const cold = frame('idle', { groupTemperature: 70 });
    expect(status(cold, word(cold, 'group', null))).toMatchObject({ title: 'Heating', tone: 'busy' });
    const warm = frame('idle', { groupTemperature: 90 });
    expect(status(warm, word(warm, 'group', null))).toMatchObject({ title: 'Idle', tone: 'ok' });
  });

  it('the group: once Idle, Heating again only more than 4 °C under its target', () => {
    expect(word(frame('idle', { groupTemperature: 89.5 }), 'group', null, 'heated')).toBe('heated');
    expect(word(frame('idle', { groupTemperature: 89 }), 'group', null, 'heated')).toBe('heated');
    expect(word(frame('idle', { groupTemperature: 88.9 }), 'group', null, 'heated')).toBe('heating');
    // heating stays heating up to the border of 3 °C
    expect(word(frame('idle', { groupTemperature: 89.5 }), 'group', null, 'heating')).toBe('heating');
    expect(word(frame('idle', { groupTemperature: 90 }), 'group', null, 'heating')).toBe('heated');
  });

  it('steam: Heating more than 3 °C under targetSteamTemp, Idle from there, also above target + 3 °C', () => {
    expect(word(frame('idle', { steamTemperature: 146.9 }), 'steam', 150)).toBe('heating');
    expect(word(frame('idle', { steamTemperature: 147 }), 'steam', 150)).toBe('heated');
    expect(word(frame('idle', { steamTemperature: 160 }), 'steam', 150)).toBe('heated');
    const cold = frame('idle', { steamTemperature: 120 });
    expect(status(cold, word(cold, 'steam', 150))).toMatchObject({ title: 'Heating', tone: 'busy' });
    const hot = frame('idle', { steamTemperature: 158 });
    expect(status(hot, word(hot, 'steam', 150))).toMatchObject({ title: 'Idle', tone: 'ok' });
    // the group's temperature does not count on the steam page, nor the steam's on home
    expect(word(frame('idle', { groupTemperature: 60, steamTemperature: 150 }), 'steam', 150)).toBe('heated');
    expect(word(frame('idle', { groupTemperature: 93, steamTemperature: 60 }), 'group', 150)).toBe('heated');
  });

  it('steam: once Idle, Heating again only more than 4 °C under its target', () => {
    expect(word(frame('idle', { steamTemperature: 146.5 }), 'steam', 150, 'heated')).toBe('heated');
    expect(word(frame('idle', { steamTemperature: 146 }), 'steam', 150, 'heated')).toBe('heated');
    expect(word(frame('idle', { steamTemperature: 145.9 }), 'steam', 150, 'heated')).toBe('heating');
    expect(word(frame('idle', { steamTemperature: 146.5 }), 'steam', 150, 'heating')).toBe('heating');
  });

  it('steam: Off with the tone off when the steam target is 0, however cold the heater', () => {
    const cold = frame('idle', { steamTemperature: 32 });
    expect(word(cold, 'steam', 0)).toBe('off');
    expect(word(cold, 'steam', 0, 'heated')).toBe('off');
    expect(status(cold, 'off')).toMatchObject({ title: HEATER_OFF, tone: 'off' });
    expect(HEATER_OFF).toBe('Off');
    // a steam target that is not known yet leaves Idle
    expect(word(cold, 'steam', null)).toBeNull();
    expect(status(cold, null)).toMatchObject({ title: 'Idle', tone: 'ok' });
  });

  it('every other state keeps its own word', () => {
    expect(word(frame('espresso', { groupTemperature: 80 }), 'group', null)).toBeNull();
    expect(word(frame('sleeping', { groupTemperature: 30 }), 'group', null)).toBeNull();
    expect(word(frame('steam', { steamTemperature: 120 }), 'steam', 150)).toBeNull();
    expect(word(frame('hotWater', { steamTemperature: 20 }), 'steam', 0)).toBeNull();
    expect(heaterWord(null, 'group', null, null)).toBeNull();
    const pouring = frame('hotWater', { groupTemperature: 70 });
    expect(status(pouring, word(pouring, 'group', null)).title).toBe('Hot water');
    // without a fresh frame the link's status stands
    const cold = frame('idle', { groupTemperature: 70 });
    expect(heatingStatus(statusOf('no-machine', cold, url), 'no-machine', 'heating').title).toBe('No machine connected');
    expect(heatingStatus(statusOf('no-machine', cold, url), 'no-machine', 'off').title).toBe('No machine connected');
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
      'tank 950 ml',
      'scale 34.0 g',
    ]);
  });

  it('says the tank in ml by default and in mm when the setting says so', () => {
    expect(text(stateLine('machine', frame('idle'), { currentLevel: 40.8, refillLevel: 5 }, 'connected', 0))[2]).toBe('tank 1130 ml');
    expect(text(stateLine('machine', frame('idle'), water, 'connected', 0, false, 'mm'))[2]).toBe('tank 35 mm');
  });

  it('warns in place of the weight when the scale is not connected', () => {
    expect(text(stateLine('machine', frame('idle'), water, 'disconnected', null)).at(-1)).toBe('scale not connected, tap to retry!');
    expect(text(stateLine('machine', frame('idle'), water, 'unknown', null)).at(-1)).toBe('scale not connected, tap to retry!');
    expect(text(stateLine('machine', frame('idle'), water, 'disconnected', null, true)).at(-1)).toBe('scale looking for it!');
  });

  it('warns when the tank is under its refill level', () => {
    expect(text(stateLine('machine', frame('idle'), { currentLevel: 3, refillLevel: 5 }, 'connected', 0))[2]).toBe('tank 70 ml!');
    expect(text(stateLine('machine', frame('idle'), { currentLevel: 3, refillLevel: 5 }, 'connected', 0, false, 'mm'))[2]).toBe(
      'tank 3 mm!',
    );
    // The warning compares mm: 5 mm is 124 ml, and a level of 4.9 mm under a refill level of 5 warns.
    expect(stateLine('machine', frame('idle'), { currentLevel: 4.9, refillLevel: 5 }, 'connected', 0)[2].warn).toBe(true);
    expect(stateLine('machine', frame('idle'), { currentLevel: 5, refillLevel: 5 }, 'connected', 0)[2].warn).toBe(false);
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
