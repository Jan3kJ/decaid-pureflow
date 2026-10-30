import { describe, expect, it } from 'vitest';
import type { MachineState } from '../api';
import {
  CLEAN,
  DESCALE,
  IDLE,
  START_TIMEOUT_MS,
  TRANSPORT,
  advance,
  caption,
  isActive,
  joined,
  started,
  steamCoolEnough,
  type Procedure,
  type Progress,
} from './maintenance';

/** The progress after frames of `[state, substate]`, one a second from a start at 0. */
function run(procedure: Procedure, frames: [MachineState | null, string | null][], from: Progress = started(0)): Progress {
  return frames.reduce(
    (progress, [state, substate], i) => advance(progress, { state, substate, now: (i + 1) * 1000 }, procedure),
    from,
  );
}

describe('the maintenance procedures (Streamline maintenance-progress.js)', () => {
  it('ask for the states Decaid knows', () => {
    expect([CLEAN.state, DESCALE.state, TRANSPORT.state]).toEqual(['cleaning', 'descaling', 'airPurge']);
  });

  it('a clean waits while the machine has not entered the state, then runs its steps', () => {
    // The first frames after the request still say idle: that is not "finished".
    expect(run(CLEAN, [['idle', 'idle']])).toMatchObject({ phase: 'waiting' });
    expect(
      run(CLEAN, [
        ['idle', 'idle'],
        ['cleaning', 'cleaningStart'],
      ]),
    ).toMatchObject({ phase: 'running', milestone: 0 });
    // Decaid reports fill and flush both as cleaningGroup: before the soak the fill, after it the flush.
    expect(
      run(CLEAN, [
        ['cleaning', 'cleaningStart'],
        ['cleaning', 'cleaningGroup'],
      ]),
    ).toMatchObject({ milestone: 1 });
    expect(
      run(CLEAN, [
        ['cleaning', 'cleaningGroup'],
        ['cleaning', 'cleanSoaking'],
      ]),
    ).toMatchObject({ milestone: 2 });
    expect(
      run(CLEAN, [
        ['cleaning', 'cleanSoaking'],
        ['cleaning', 'cleaningGroup'],
      ]),
    ).toMatchObject({ milestone: 3 });
    // A step does not go back.
    expect(
      run(CLEAN, [
        ['cleaning', 'cleanSoaking'],
        ['cleaning', 'cleaningStart'],
      ]),
    ).toMatchObject({ milestone: 2 });
  });

  it('a clean that has left the state is done', () => {
    const done = run(CLEAN, [
      ['cleaning', 'cleaningStart'],
      ['cleaning', 'cleanSoaking'],
      ['idle', 'idle'],
    ]);
    expect(done).toMatchObject({ phase: 'done', milestone: CLEAN.milestones.length });
    expect(caption(done, CLEAN)).toEqual({ text: 'Ready', tone: 'success' });
    expect(isActive(done)).toBe(false);
  });

  it('the simulated DE1 stays in cleaning with the substate idle: running at its first step (rig)', () => {
    const progress = run(CLEAN, [
      ['idle', 'idle'],
      ['cleaning', 'idle'],
      ['cleaning', 'idle'],
    ]);
    expect(progress).toMatchObject({ phase: 'running', milestone: 0 });
    expect(caption(progress, CLEAN)).toEqual({ text: 'Starting', tone: 'progress' });
  });

  it('times out when the machine never enters the state', () => {
    const before = advance(started(0), { state: 'idle', substate: 'idle', now: START_TIMEOUT_MS - 1 }, CLEAN);
    expect(before.phase).toBe('waiting');
    const after = advance(before, { state: 'idle', substate: 'idle', now: START_TIMEOUT_MS }, CLEAN);
    expect(after.phase).toBe('timeout');
    expect(caption(after, CLEAN)?.tone).toBe('error');
  });

  it('without a frame it cannot tell: stale, no end and no timeout', () => {
    const running = run(CLEAN, [['cleaning', 'cleaningStart']]);
    const blind = advance(running, { state: null, substate: null, now: 60000 }, CLEAN);
    expect(blind).toMatchObject({ phase: 'running', stale: true });
    expect(caption(blind, CLEAN)?.tone).toBe('error');
    const waiting = advance(started(0), { state: null, substate: null, now: START_TIMEOUT_MS * 2 }, CLEAN);
    expect(waiting).toMatchObject({ phase: 'waiting', stale: true });
    // Idle stays idle without frames.
    expect(advance(IDLE, { state: null, substate: null, now: 0 }, CLEAN)).toBe(IDLE);
  });

  it('descaling: start, descale, steam', () => {
    expect(
      run(DESCALE, [
        ['descaling', 'cleaningStart'],
        ['descaling', 'cleaningGroup'],
      ]),
    ).toMatchObject({ milestone: 1 });
    expect(
      run(DESCALE, [
        ['descaling', 'cleaningGroup'],
        ['descaling', 'cleaningSteam'],
      ]),
    ).toMatchObject({ milestone: 2 });
  });

  it('transport mode has one step and says the machine can be turned off when it has ended', () => {
    const done = run(TRANSPORT, [
      ['airPurge', 'idle'],
      ['idle', 'idle'],
    ]);
    expect(caption(done, TRANSPORT)?.text).toMatch(/turn your machine off/);
  });

  it('a procedure the machine already runs is joined; another state is not', () => {
    expect(joined('cleaning', CLEAN, 0)).toMatchObject({ phase: 'running' });
    expect(joined('descaling', CLEAN, 0)).toBe(IDLE);
    expect(joined(null, CLEAN, 0)).toBe(IDLE);
  });

  it('descales only with the steam boiler at 60 °C or under; no reading does not hold it up', () => {
    expect(steamCoolEnough(150)).toBe(false);
    expect(steamCoolEnough(60)).toBe(true);
    expect(steamCoolEnough(null)).toBe(true);
    expect(steamCoolEnough(Number.NaN)).toBe(true);
  });
});
