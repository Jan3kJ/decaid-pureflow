import { describe, expect, it } from 'vitest';
import { readShotState, type ShotStateFrame } from '../api';
import { emptySeries, type Shot } from './shot';
import { markStop, STOP_LINES, stopLine } from './stop-reason';

// Why the finished shot on home stopped: the line belongs to the skin's shot of the stop frame
// and goes with the next shot.

const shot = (enteredAt: number, ended: boolean): Shot => ({
  enteredAt,
  startedAt: enteredAt + 500,
  series: emptySeries(),
  samples: [],
  finalWeight: ended ? 36 : null,
  ended,
  endedAt: ended ? enteredAt + 30_000 : null,
});

const frame = (change: Record<string, unknown>): ShotStateFrame =>
  readShotState({ event: 'state', shotId: 'shot-a', state: 'pouring', decision: null, ...change })!;

const stop = (reason: string, shotId = 'shot-a', kind = 'stop') =>
  frame({ event: 'decision', shotId, state: 'stopping', decision: { kind, reason, details: null, data: null } });

describe('the line of why a shot stopped', () => {
  it('names each reason under the finished shot it came in, not while the shot runs', () => {
    for (const [reason, line] of [
      ['targetWeight', 'stopped at the target weight'],
      ['targetVolume', 'stopped at the target volume'],
      ['apiStop', 'stopped by hand'],
      ['appStop', 'stopped by hand'],
      ['machineEnded', 'ended by the machine'],
    ]) {
      const mark = markStop(null, stop(reason), shot(1000, false));
      expect(mark).toEqual({ enteredAt: 1000, shotId: 'shot-a', reason });
      expect(stopLine(mark, shot(1000, false))).toBeNull();
      expect(stopLine(mark, shot(1000, true))).toBe(line);
    }
    expect(Object.keys(STOP_LINES)).toHaveLength(5);
  });

  it('is none for the other reasons and the abort for want of a scale', () => {
    for (const [kind, reason] of [
      ['advance', 'profileAdvance'],
      ['advance', 'profileSkip'],
      ['finalize', 'stoppingBackstop'],
      ['abort', 'noScale'],
      ['terminal', 'error'],
    ]) {
      const mark = markStop(null, stop(reason, 'shot-a', kind), shot(1000, false));
      expect(mark, `${kind} ${reason}`).toBeNull();
    }
  });

  it("keeps the shot's first stop: the backstop and a second stop after it change nothing", () => {
    let mark = markStop(null, stop('targetWeight'), shot(1000, false));
    mark = markStop(mark, stop('apiStop'), shot(1000, true));
    mark = markStop(mark, stop('stoppingBackstop', 'shot-a', 'finalize'), shot(1000, true));
    mark = markStop(mark, frame({ shotId: null, state: 'idle' }), shot(1000, true));
    expect(stopLine(mark, shot(1000, true))).toBe('stopped at the target weight');
  });

  it('is gone when the next shot starts, by the skin and by the feed', () => {
    const mark = markStop(null, stop('apiStop'), shot(1000, false));
    expect(stopLine(mark, shot(90_000, false))).toBeNull();
    expect(stopLine(mark, shot(90_000, true))).toBeNull();
    for (const state of ['preheating', 'pouring']) {
      expect(markStop(mark, frame({ shotId: 'shot-b', state }), shot(1000, true)), state).toBeNull();
    }
    // The next shot's own stop is its line.
    const next = markStop(mark, stop('machineEnded', 'shot-b'), shot(90_000, false));
    expect(stopLine(next, shot(90_000, true))).toBe('ended by the machine');
  });

  it('is none without a shot of the skin: a shot read from the history or after a reload', () => {
    expect(markStop(null, stop('targetWeight'), null)).toBeNull();
    expect(stopLine(null, shot(1000, true))).toBeNull();
    expect(stopLine({ enteredAt: 1000, shotId: 'shot-a', reason: 'apiStop' }, null)).toBeNull();
  });
});
