import { describe, expect, it } from 'vitest';
import { DecaidApiError, readShotState, type MachineSnapshot, type MachineState, type ShotStateFrame } from '../api';
import { NoScale, ONE_START_MS } from './no-scale.svelte';

// The popup for a shot Decaid stopped for want of a scale: the feed's abort, the REST answer and
// the short espresso open it, once for one blocked start; nothing else does.

function abort(shotId = 'shot-1', reason = 'noScale', kind = 'abort'): ShotStateFrame {
  return readShotState({
    event: 'decision',
    shotId,
    state: 'idle',
    scaleConnected: false,
    scaleLost: false,
    machineHasAutonomousSAW: false,
    decision: { kind, reason, details: 'No scale connected, blocking shot', data: null },
  })!;
}

function machine(state: MachineState, seconds: number): MachineSnapshot {
  return {
    timestamp: new Date(Date.UTC(2026, 10, 1, 9, 0, 0) + seconds * 1000).toISOString().replace('Z', '000'),
    state: { state, substate: state === 'espresso' ? 'preparingForShot' : 'idle' },
    flow: 0,
    pressure: 0,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature: 90,
    groupTemperature: 92,
    targetMixTemperature: 93,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 150,
  };
}

const NO_SCALE_ANSWER = new DecaidApiError('PUT', '/api/v1/machine/state/espresso', 400, {
  details: 'No scale detected, blocking espresso request',
  type: 'block_no_scale',
});

function popup(options: { scale?: boolean; required?: boolean } = {}) {
  const clock = { now: 0 };
  const noScale = new NoScale({
    scaleConnected: () => options.scale ?? false,
    blockOnNoScale: () => Promise.resolve(options.required ?? true),
    now: () => clock.now,
  });
  return { noScale, clock };
}

/** An espresso from 0 s to `seconds`, then idle. */
async function espresso(noScale: NoScale, seconds: number): Promise<void> {
  noScale.machine(machine('idle', -1), 'idle');
  noScale.machine(machine('espresso', 0), 'idle');
  noScale.machine(machine('espresso', seconds / 2), 'espresso');
  noScale.machine(machine('idle', seconds), 'espresso');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('the popup for a shot stopped for want of a scale', () => {
  it("opens on the feed's abort for 'noScale' and closes", () => {
    const { noScale } = popup();
    noScale.frame(abort());
    expect(noScale.open).toBe(true);
    noScale.close();
    expect(noScale.open).toBe(false);
  });

  it('stays shut for another abort, a stop, a terminal end and an advance', () => {
    const { noScale } = popup();
    for (const frame of [
      abort('a', 'error'),
      abort('b', 'apiStop', 'stop'),
      abort('c', 'error', 'terminal'),
      abort('d', 'profileAdvance', 'advance'),
    ]) {
      noScale.frame(frame);
    }
    expect(noScale.open).toBe(false);
  });

  it("opens on the REST answer 'block_no_scale', and takes no other refusal", () => {
    const { noScale } = popup();
    expect(noScale.refused(new DecaidApiError('PUT', '/api/v1/machine/state/idle', 500, { error: 'away' }))).toBe(false);
    expect(noScale.refused(new Error('away'))).toBe(false);
    expect(noScale.open).toBe(false);
    expect(noScale.refused(NO_SCALE_ANSWER)).toBe(true);
    expect(noScale.open).toBe(true);
  });

  it("opens after an espresso under 3 s without a scale and with 'scale required' on", async () => {
    const { noScale } = popup();
    await espresso(noScale, 0.1);
    expect(noScale.open).toBe(true);
  });

  it("stays shut after a short espresso with the scale connected, or with 'scale required' off", async () => {
    for (const options of [{ scale: true }, { required: false }]) {
      const { noScale } = popup(options);
      await espresso(noScale, 0.1);
      expect(noScale.open, JSON.stringify(options)).toBe(false);
    }
  });

  it('stays shut after an espresso of 3 s or more, and when the setting cannot be read', async () => {
    const { noScale } = popup();
    await espresso(noScale, 3);
    await espresso(noScale, 30);
    expect(noScale.open).toBe(false);
    const away = new NoScale({ scaleConnected: () => false, blockOnNoScale: () => Promise.reject(new Error('away')) });
    await espresso(away, 0.1);
    expect(away.open).toBe(false);
  });

  it('shows one popup for one blocked start: the frame repeated, the REST answer and the short espresso with it', async () => {
    const { noScale, clock } = popup();
    noScale.refused(NO_SCALE_ANSWER);
    noScale.frame(abort());
    noScale.close();
    clock.now = 200;
    noScale.frame(abort());
    await espresso(noScale, 0.1);
    expect(noScale.open).toBe(false);
  });

  it('shows the next blocked start again: later, or another shot at once', () => {
    const { noScale, clock } = popup();
    noScale.frame(abort('shot-1'));
    noScale.close();
    clock.now = 100;
    noScale.frame(abort('shot-2'));
    expect(noScale.open).toBe(true);
    noScale.close();
    clock.now = 100 + ONE_START_MS;
    noScale.refused(NO_SCALE_ANSWER);
    expect(noScale.open).toBe(true);
  });
});
