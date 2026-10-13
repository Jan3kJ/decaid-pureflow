import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState } from '../api';
import { gatewayBaseUrl } from './gateway';
import { FRAME_STALE_MS, gatewayAfter, homeAction, linkOf, stateLabel, statusOf } from './machine';
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
    expect(gatewayBaseUrl({ protocol: 'http:', hostname: '192.168.1.20', search: '' })).toBe(
      'http://192.168.1.20:8080',
    );
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
  });

  it('never restores the espresso screen: it follows the machine', () => {
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
  it('opens the espresso screen when the machine enters espresso, from any screen', () => {
    expect(followMachine('home', 'idle', 'espresso')).toBe('espresso');
    expect(followMachine('editor', 'idle', 'espresso')).toBe('espresso');
  });

  it('opens it when the skin loads in the middle of a shot', () => {
    expect(followMachine('home', undefined, 'espresso')).toBe('espresso');
  });

  it('returns to home when the machine leaves espresso', () => {
    expect(followMachine('espresso', 'espresso', 'idle')).toBe('home');
  });

  it('leaves a screen the user went to during the shot', () => {
    expect(followMachine('profiles', 'espresso', 'idle')).toBe('profiles');
    expect(followMachine('home', 'espresso', 'espresso')).toBe('home');
  });

  it('does nothing on other changes of state', () => {
    expect(followMachine('editor', 'idle', 'steam')).toBe('editor');
    expect(followMachine('home', 'sleeping', 'idle')).toBe('home');
    expect(followMachine('espresso', undefined, 'idle')).toBe('espresso');
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
    expect(gatewayAfter('connected', 'failed')).toBe('lost');
    expect(linkOf('lost', 1000, 1500, 2000)).toBe('no-gateway');
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

describe('statusOf', () => {
  const url = 'http://localhost:8080';

  it('names the gateway when it does not answer', () => {
    const status = statusOf('no-gateway', frame('idle'), url);
    expect(status.title).toBe('Decaid is not reachable');
    expect(status.detail).toContain(url);
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

describe('homeAction', () => {
  it('starts from idle only', () => {
    expect(homeAction('machine', frame('idle'))).toBe('start');
    expect(homeAction('machine', frame('sleeping'))).toBe('none');
    expect(homeAction('machine', frame('heating'))).toBe('none');
  });

  it('stops what runs', () => {
    expect(homeAction('machine', frame('espresso'))).toBe('stop');
    expect(homeAction('machine', frame('steam'))).toBe('stop');
  });

  it('offers nothing without a machine', () => {
    expect(homeAction('no-machine', frame('idle'))).toBe('none');
    expect(homeAction('no-gateway', frame('espresso'))).toBe('none');
    expect(homeAction('connecting', null)).toBe('none');
  });
});
