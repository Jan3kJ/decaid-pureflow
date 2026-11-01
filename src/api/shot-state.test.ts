import { describe, expect, it } from 'vitest';
import { isNoScaleAbort, readShotState } from './shot-state';
import { machineShotStateStream } from './stream';

// The reader of a frame of `/ws/v1/machine/shotState`: the frames are Decaid's own, as the rig
// sent them, and as its source writes them.

const NO_SCALE = {
  event: 'decision',
  timestamp: '2026-11-01T06:07:10.666680',
  shotId: '309811a3-6f9c-4524-98d0-50ad4f93e063',
  state: 'idle',
  machineState: 'espresso',
  machineSubstate: 'preparingForShot',
  profileFrame: 0,
  scaleConnected: false,
  scaleLost: false,
  machineHasAutonomousSAW: false,
  decision: { kind: 'abort', reason: 'noScale', details: 'No scale connected, blocking shot', data: null },
};

const IDLE = {
  event: 'state',
  timestamp: '2026-11-01T06:06:02.591422',
  shotId: null,
  state: 'idle',
  machineState: null,
  machineSubstate: null,
  profileFrame: null,
  scaleConnected: false,
  scaleLost: false,
  machineHasAutonomousSAW: false,
  decision: null,
};

const decided = (kind: string, reason: string, more: Record<string, unknown> = {}) => ({
  ...NO_SCALE,
  state: 'pouring',
  scaleConnected: true,
  decision: { kind, reason, details: null, data: null },
  ...more,
});

describe('a frame of the shot feed', () => {
  it('reads the abort for want of a scale, every field the skin uses', () => {
    expect(readShotState(NO_SCALE)).toEqual({
      event: 'decision',
      shotId: '309811a3-6f9c-4524-98d0-50ad4f93e063',
      state: 'idle',
      scaleConnected: false,
      scaleLost: false,
      machineHasAutonomousSAW: false,
      decision: { kind: 'abort', reason: 'noScale', details: 'No scale connected, blocking shot', data: null },
    });
    expect(isNoScaleAbort(readShotState(NO_SCALE))).toBe(true);
  });

  it('reads the idle frame the feed sends when it opens, without a decision', () => {
    const frame = readShotState(IDLE);
    expect(frame).toMatchObject({ event: 'state', shotId: null, state: 'idle', decision: null });
    expect(isNoScaleAbort(frame)).toBe(false);
  });

  it("reads a stop's reason, its data and the scale's flags", () => {
    const frame = readShotState(
      decided('stop', 'targetWeight', {
        scaleLost: true,
        machineHasAutonomousSAW: true,
        decision: { kind: 'stop', reason: 'targetWeight', details: 'Target weight reached', data: { projectedWeight: 36.2 } },
      }),
    );
    expect(frame).toMatchObject({
      state: 'pouring',
      scaleConnected: true,
      scaleLost: true,
      machineHasAutonomousSAW: true,
      decision: { kind: 'stop', reason: 'targetWeight', details: 'Target weight reached', data: { projectedWeight: 36.2 } },
    });
  });

  it('reads a terminal frame', () => {
    const frame = readShotState({ ...decided('terminal', 'disconnected'), event: 'terminal' });
    expect(frame?.event).toBe('terminal');
    expect(frame?.decision).toMatchObject({ kind: 'terminal', reason: 'disconnected', details: null });
  });

  it('is no abort for want of a scale for another abort, a stop, a terminal or an advance', () => {
    for (const [kind, reason] of [
      ['abort', 'error'],
      ['stop', 'noScale'],
      ['stop', 'apiStop'],
      ['terminal', 'error'],
      ['advance', 'profileAdvance'],
      ['finalize', 'machineEnded'],
    ]) {
      expect(isNoScaleAbort(readShotState(decided(kind, reason))), `${kind} ${reason}`).toBe(false);
    }
    expect(isNoScaleAbort(null)).toBe(false);
  });

  it("keeps a kind and a reason it does not know, as a newer Decaid's", () => {
    expect(readShotState(decided('pause', 'somethingNew'))?.decision).toMatchObject({ kind: 'pause', reason: 'somethingNew' });
  });

  it('takes a missing flag as false, a missing id as null, and an empty text or a decision without its kind as none', () => {
    expect(readShotState({ event: 'decision', state: 'pouring', decision: { reason: 'noScale' } })).toEqual({
      event: 'decision',
      shotId: null,
      state: 'pouring',
      scaleConnected: false,
      scaleLost: false,
      machineHasAutonomousSAW: false,
      decision: null,
    });
    expect(
      readShotState(decided('stop', 'apiStop', { decision: { kind: 'stop', reason: 'apiStop', details: '' } }))?.decision?.details,
    ).toBeNull();
  });

  it('is null for what is not a frame: an error frame, an unknown event or phase, no object', () => {
    for (const raw of [
      { error: 'machine not connected' },
      { ...IDLE, event: 'other' },
      { ...IDLE, state: 'brewing' },
      null,
      'idle',
      [IDLE],
    ]) {
      expect(readShotState(raw)).toBeNull();
    }
  });

  it("is read from the gateway's /ws/v1/machine/shotState", () => {
    expect(machineShotStateStream({ baseUrl: 'http://rig:8080' }).url).toBe('ws://rig:8080/ws/v1/machine/shotState');
  });
});
