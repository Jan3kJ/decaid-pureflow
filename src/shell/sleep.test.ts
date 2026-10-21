import { describe, expect, it } from 'vitest';
import type { MachineState } from '../api';
import { AWAKE, askSleep, followSleep, type SleepMark } from './sleep';

// Who asked for the machine's sleep (spec 3.10): 'Machine sleep' keeps the app awake until the
// machine wakes; every other sleep shows the Asleep screen.

/** The mark after the frames, from `mark`, the machine idle before the first. */
function run(mark: SleepMark, states: MachineState[]): SleepMark {
  let before: MachineState | undefined = 'idle';
  for (const state of states) {
    mark = followSleep(mark, before, state);
    before = state;
  }
  return mark;
}

describe('the sleep mark', () => {
  it("'Machine sleep' keeps the app awake while the machine sleeps", () => {
    expect(run(askSleep(true), ['idle', 'sleeping'])).toEqual({ asked: false, machineOnly: true });
    expect(run(askSleep(true), ['sleeping', 'sleeping', 'sleeping']).machineOnly).toBe(true);
  });

  it('a wake, from the menu, the Asleep screen or the machine, clears it', () => {
    const woken = run(askSleep(true), ['sleeping', 'idle']);
    expect(woken).toEqual(AWAKE);
    // The next sleep, Decaid's timeout for one, shows the Asleep screen again.
    expect(run(woken, ['sleeping']).machineOnly).toBe(false);
  });

  it("'Machine and app sleep' and a sleep the skin did not ask for show the Asleep screen", () => {
    expect(run(askSleep(false), ['sleeping']).machineOnly).toBe(false);
    expect(run(AWAKE, ['sleeping']).machineOnly).toBe(false);
    // 'Machine and app sleep' after 'Machine sleep' was asked takes the ask back.
    expect(askSleep(false)).toEqual(AWAKE);
  });

  it('a machine already asleep at the first frame shows the Asleep screen', () => {
    expect(followSleep(AWAKE, undefined, 'sleeping')).toEqual(AWAKE);
  });

  it('the ask waits for the sleeping frame through the frames before it', () => {
    expect(run(askSleep(true), ['idle', 'idle'])).toEqual({ asked: true, machineOnly: false });
  });
});
