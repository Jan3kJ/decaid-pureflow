import { describe, expect, it } from 'vitest';
import { abnormalEnd, isNoScaleAbort, readShotState, scaleLostWhilePouring, stopReason } from './shot-state';
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

// The rig's stop frames (Decaid 0.8.8, simulated DE1 and scale): at the target weight, by a
// REST request for idle (the skin's stop) and at the profile's end.
const RIG_STOP = {
  event: 'decision',
  timestamp: '2026-11-01T07:53:17.366012',
  shotId: '91d87121-95d8-4800-ae4b-aa58741f595f',
  state: 'stopping',
  machineState: 'espresso',
  machineSubstate: 'pouring',
  profileFrame: 5,
  scaleConnected: true,
  scaleLost: false,
  machineHasAutonomousSAW: false,
  decision: {
    kind: 'stop',
    reason: 'targetWeight',
    details: 'Target weight 10.0g reached (projected: 10.219314975360128). Stopping shot.',
    data: { targetYield: 10, projectedWeight: 10.219314975360128 },
  },
};

describe('why a shot stopped', () => {
  it("reads the rig's stops: at the target weight, by hand and by the machine", () => {
    expect(stopReason(readShotState(RIG_STOP))).toBe('targetWeight');
    const byHand = { ...RIG_STOP, machineState: 'idle', machineSubstate: 'idle', profileFrame: 0 };
    const hand = { kind: 'stop', reason: 'apiStop', details: 'Shot stopped via REST API request', data: null };
    expect(stopReason(readShotState({ ...byHand, decision: hand }))).toBe('apiStop');
    const ended = { kind: 'stop', reason: 'machineEnded', details: 'Machine reported shot end (pouringDone)', data: null };
    expect(stopReason(readShotState({ ...RIG_STOP, machineSubstate: 'pouringDone', decision: ended }))).toBe('machineEnded');
  });

  it('reads every reason home names, from a stop and from an abort', () => {
    for (const reason of ['targetWeight', 'targetVolume', 'apiStop', 'appStop', 'machineEnded']) {
      expect(stopReason(readShotState(decided('stop', reason))), `stop ${reason}`).toBe(reason);
      expect(stopReason(readShotState(decided('abort', reason))), `abort ${reason}`).toBe(reason);
    }
  });

  it('is none for the abort for want of a scale, the other reasons and kinds, and a frame without a decision', () => {
    expect(stopReason(readShotState(NO_SCALE))).toBeNull();
    for (const [kind, reason] of [
      ['advance', 'profileAdvance'],
      ['advance', 'profileSkip'],
      ['finalize', 'stoppingBackstop'],
      ['stop', 'stoppingBackstop'],
      ['abort', 'error'],
      ['terminal', 'disconnected'],
      ['finalize', 'machineEnded'],
      ['advance', 'targetWeight'],
      ['stop', 'somethingNew'],
    ]) {
      expect(stopReason(readShotState(decided(kind, reason))), `${kind} ${reason}`).toBeNull();
    }
    expect(stopReason(readShotState(IDLE))).toBeNull();
    expect(stopReason(null)).toBeNull();
  });
});

// The rig's frames: the scale taken away mid-shot (its next frame, a step's advance, says it), and
// the machine's connection cut mid-shot.
const RIG_SCALE_LOST = {
  ...NO_SCALE,
  shotId: '00b3eb98-8051-4048-b043-477725ecf427',
  state: 'pouring',
  machineState: 'espresso',
  machineSubstate: 'preparingForShot',
  profileFrame: 5,
  scaleConnected: false,
  scaleLost: true,
  decision: {
    kind: 'advance',
    reason: 'profileAdvance',
    details: 'Firmware advanced from frame 4 to 5',
    data: { fromFrame: 4, toFrame: 5 },
  },
};

const RIG_CUT = {
  ...NO_SCALE,
  event: 'terminal',
  shotId: '68469d1a-70c5-499d-bc26-48b8600a5564',
  state: 'pouring',
  machineSubstate: 'pouring',
  profileFrame: 2,
  scaleConnected: true,
  decision: { kind: 'terminal', reason: 'disconnected', details: 'Shot tracking torn down mid-shot', data: null },
};

describe('the scale lost while the shot pours', () => {
  it("reads the rig's frame after the scale was taken away", () => {
    expect(scaleLostWhilePouring(readShotState(RIG_SCALE_LOST))).toBe(true);
  });

  it('is none before the loss, outside the pour, on a Bengle, or without a frame', () => {
    expect(scaleLostWhilePouring(readShotState({ ...RIG_SCALE_LOST, scaleLost: false }))).toBe(false);
    for (const state of ['preheating', 'stopping', 'finished', 'idle']) {
      expect(scaleLostWhilePouring(readShotState({ ...RIG_SCALE_LOST, state })), state).toBe(false);
    }
    expect(scaleLostWhilePouring(readShotState({ ...RIG_SCALE_LOST, machineHasAutonomousSAW: true }))).toBe(false);
    expect(scaleLostWhilePouring(null)).toBe(false);
  });
});

describe('an abnormal end', () => {
  it("reads the rig's frame for the machine's connection cut, with Decaid's words", () => {
    expect(abnormalEnd(readShotState(RIG_CUT))).toEqual({ reason: 'disconnected', details: 'Shot tracking torn down mid-shot' });
  });

  it('reads an error, a terminal decision on another event, and a reason it does not know as an error', () => {
    expect(abnormalEnd(readShotState({ ...decided('terminal', 'error'), event: 'terminal' }))).toEqual({
      reason: 'error',
      details: null,
    });
    expect(abnormalEnd(readShotState(decided('terminal', 'disconnected')))).toEqual({ reason: 'disconnected', details: null });
    expect(abnormalEnd(readShotState({ ...decided('terminal', 'somethingNew'), event: 'terminal' }))).toMatchObject({
      reason: 'error',
    });
    expect(abnormalEnd(readShotState({ ...IDLE, event: 'terminal' }))).toEqual({ reason: 'error', details: null });
  });

  it('is none for a stop, an abort, an advance, the backstop, a state frame or no frame', () => {
    for (const [kind, reason] of [
      ['stop', 'apiStop'],
      ['abort', 'noScale'],
      ['abort', 'error'],
      ['advance', 'profileAdvance'],
      ['finalize', 'stoppingBackstop'],
    ]) {
      expect(abnormalEnd(readShotState(decided(kind, reason))), `${kind} ${reason}`).toBeNull();
    }
    expect(abnormalEnd(readShotState(IDLE))).toBeNull();
    expect(abnormalEnd(null)).toBeNull();
  });
});
