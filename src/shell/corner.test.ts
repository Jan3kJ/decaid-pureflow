import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState } from '../api';
import { cornerOf, lightOf, type Light } from './corner';
import { HEATER_OFF, heatingStatus, statusOf, type Link } from './machine';

const URL = 'http://localhost:8080';

function frame(state: MachineState): MachineSnapshot {
  return {
    timestamp: '2026-10-13T06:37:17.000000',
    state: { state, substate: 'idle' },
    flow: 0,
    pressure: 0,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature: 90,
    groupTemperature: 91,
    targetMixTemperature: 93,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 150,
  };
}

const STATES: Record<MachineState, { corner: 'none' | 'word' | 'fault'; light: Light }> = {
  booting: { corner: 'none', light: 'none' },
  busy: { corner: 'none', light: 'none' },
  idle: { corner: 'none', light: 'none' },
  sleeping: { corner: 'word', light: 'none' },
  heating: { corner: 'none', light: 'heating' },
  preheating: { corner: 'none', light: 'none' },
  espresso: { corner: 'none', light: 'flow' },
  hotWater: { corner: 'none', light: 'flow' },
  flush: { corner: 'none', light: 'flow' },
  steam: { corner: 'none', light: 'steam' },
  steamRinse: { corner: 'none', light: 'flow' },
  skipStep: { corner: 'none', light: 'none' },
  cleaning: { corner: 'none', light: 'none' },
  descaling: { corner: 'none', light: 'none' },
  calibration: { corner: 'none', light: 'none' },
  selfTest: { corner: 'none', light: 'none' },
  airPurge: { corner: 'none', light: 'none' },
  needsWater: { corner: 'fault', light: 'fault' },
  error: { corner: 'fault', light: 'fault' },
  fwUpgrade: { corner: 'none', light: 'none' },
};

describe('the header corner and light for every machine state', () => {
  for (const [state, want] of Object.entries(STATES) as [MachineState, (typeof STATES)[MachineState]][]) {
    it(state, () => {
      const status = statusOf('machine', frame(state), URL);
      expect(cornerOf('machine', status).kind).toBe(want.corner);
      expect(lightOf('machine', status, state)).toBe(want.light);
    });
  }

  it('shows Asleep as a dim word', () => {
    expect(cornerOf('machine', statusOf('machine', frame('sleeping'), URL))).toEqual({ kind: 'word', word: 'Asleep' });
  });

  it('shows a fault with its detail, and no reconnect for a machine fault', () => {
    const corner = cornerOf('machine', statusOf('machine', frame('needsWater'), URL));
    expect(corner).toMatchObject({ kind: 'fault', title: 'Needs water', reconnect: false });
  });

  it('shows no word and no light for a state it does not list', () => {
    const status = statusOf('machine', frame('somethingNew' as MachineState), URL);
    expect(cornerOf('machine', status).kind).toBe('none');
    expect(lightOf('machine', status, 'somethingNew')).toBe('none');
  });
});

describe('the header corner and light for every link', () => {
  const LINKS: Record<Link, { corner: 'none' | 'fault'; title: string; reconnect: boolean }> = {
    connecting: { corner: 'none', title: 'Connecting', reconnect: false },
    'no-gateway': { corner: 'fault', title: 'Decaid is not reachable', reconnect: false },
    refused: { corner: 'fault', title: 'Decaid closed the connection', reconnect: true },
    'no-machine': { corner: 'fault', title: 'No machine connected', reconnect: false },
    machine: { corner: 'none', title: 'Idle', reconnect: false },
  };
  for (const [link, want] of Object.entries(LINKS) as [Link, (typeof LINKS)[Link]][]) {
    it(link, () => {
      const status = statusOf(link, link === 'machine' ? frame('idle') : null, URL);
      const corner = cornerOf(link, status);
      expect(corner.kind).toBe(want.corner);
      if (corner.kind === 'fault') {
        expect(corner.title).toBe(want.title);
        expect(corner.reconnect).toBe(want.reconnect);
        expect(corner.detail).not.toBe('');
      }
      expect(lightOf(link, status, link === 'machine' ? 'idle' : null)).toBe(want.corner === 'fault' ? 'fault' : 'none');
    });
  }

  it('keeps a fault orange when a stale frame is still known', () => {
    const status = statusOf('no-machine', frame('espresso'), URL);
    expect(lightOf('no-machine', status, 'espresso')).toBe('fault');
  });
});

describe('the heater words of a page that waits for a heater', () => {
  const idle = statusOf('machine', frame('idle'), URL);

  it('a heating heater is the red light and no word', () => {
    const status = heatingStatus(idle, 'machine', 'heating');
    expect(cornerOf('machine', status).kind).toBe('none');
    expect(lightOf('machine', status, 'idle')).toBe('heating');
  });

  it('a steam heater that is off is the dim word Off and no light', () => {
    const status = heatingStatus(idle, 'machine', 'off');
    expect(cornerOf('machine', status)).toEqual({ kind: 'word', word: HEATER_OFF });
    expect(lightOf('machine', status, 'idle')).toBe('none');
  });

  it('a heated heater shows nothing', () => {
    const status = heatingStatus(idle, 'machine', 'heated');
    expect(cornerOf('machine', status).kind).toBe('none');
    expect(lightOf('machine', status, 'idle')).toBe('none');
  });
});
