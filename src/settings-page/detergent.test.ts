import { describe, expect, it } from 'vitest';
import type { MachineState, Workflow } from '../api';
import bundled from '../steps/fixtures/bundled-profiles.json';
import {
  DETERGENT_MILESTONES,
  DETERGENT_TITLE,
  FLUSH_SECONDS,
  NOT_STARTED,
  abandoned,
  begun,
  detergentCaption,
  earlierOf,
  flushIsOver,
  follow,
  followsRun,
  machineRuns,
  milestoneOf,
  readStored,
  restorePatch,
  type Detergent,
  type DetergentFrame,
  type Earlier,
  type Stage,
} from './detergent';
import { CLEAN, IDLE, START_TIMEOUT_MS, started } from './maintenance';

const EARLIER: Earlier = { profile: null, targetYield: 36, targetDoseWeight: 18 };
const LAST = 8;

function frame(state: MachineState, change: Partial<DetergentFrame> = {}): DetergentFrame {
  return { state, substate: 'idle', profileFrame: 0, at: 0, now: 0, lastStep: LAST, flushDuration: 10, ...change };
}

const at = (stage: Stage, change: Partial<Detergent> = {}): Detergent => ({ ...begun(EARLIER), stage, ...change });

describe('the clean with detergent', () => {
  it('its profile is bundled under that title, with the five rises the card names', () => {
    const profile = (bundled as { title: string; steps: { name: string }[] }[]).find((entry) => entry.title === DETERGENT_TITLE);
    expect(profile?.steps.map((step) => step.name)).toEqual([
      'Pressure rise 1',
      'Pause 1',
      'Pressure rise 2',
      'Pause 2',
      'Pressure rise 3',
      'Pause 3',
      'Pressure rise 4',
      'Pause 4',
      'Pressure rise 5',
    ]);
    expect(profile?.steps).toHaveLength(LAST + 1);
  });

  it('has three steps, and a milestone for each state', () => {
    expect(DETERGENT_MILESTONES).toEqual(['Run', 'Flush', 'Cleaning cycle']);
    const milestones = (['idle', 'run-ready', 'run', 'flush-ready', 'flush', 'cycle-ready', 'cycle', 'done'] as const).map((stage) =>
      milestoneOf(at(stage)),
    );
    expect(milestones).toEqual([-1, 0, 0, 1, 1, 2, 2, 3]);
  });

  it('waits for the user at the machine: no frame but a shot moves the first step', () => {
    const ready = begun(EARLIER);
    for (const state of ['idle', 'sleeping', 'heating', 'steam'] as const) expect(follow(ready, frame(state))).toBe(ready);
    expect(follow(ready, frame('espresso', { profileFrame: 0 }))).toMatchObject({ stage: 'run', step: 0 });
  });

  it('follows the run to its last step, and an end there leads to the flush', () => {
    let run = follow(begun(EARLIER), frame('espresso'));
    run = follow(run, frame('espresso', { profileFrame: 4 }));
    expect(run.step).toBe(4);
    // A step does not go back.
    expect(follow(run, frame('espresso', { profileFrame: 2 }))).toBe(run);
    expect(follow(run, frame('skipStep', { profileFrame: 4 }))).toBe(run);
    run = follow(run, frame('espresso', { profileFrame: LAST }));
    expect(follow(run, frame('idle'))).toMatchObject({ stage: 'flush-ready', stopped: false });
  });

  it('a frame number left from the last shot does not count as the last step', () => {
    const run = follow(begun(EARLIER), frame('espresso', { substate: 'preparingForShot', profileFrame: LAST }));
    const held = follow(run, frame('espresso', { substate: 'preparingForShot', profileFrame: LAST }));
    expect(held.step).toBe(0);
    expect(follow(held, frame('idle'))).toMatchObject({ stage: 'run-ready', stopped: true });
  });

  it('a run stopped at the machine puts the card back at its step, not further', () => {
    const stopped = follow(at('run', { step: 4 }), frame('idle'));
    expect(stopped).toMatchObject({ stage: 'run-ready', stopped: true, step: 0 });
    expect(detergentCaption(stopped, null)?.text).toBe(
      `Stopped at the machine. ${DETERGENT_TITLE} is loaded: start it at the machine.`,
    );
    // The next try starts clean.
    expect(follow(stopped, frame('espresso'))).toMatchObject({ stage: 'run', stopped: false });
  });

  it('a flush of its time leads to the cycle, a flush stopped early puts the card back', () => {
    const flushing = follow(at('flush-ready'), frame('flush', { at: 1000 }));
    expect(flushing).toMatchObject({ stage: 'flush', since: 1000 });
    expect(follow(flushing, frame('flush', { at: 5000 }))).toBe(flushing);
    expect(follow(flushing, frame('idle', { at: 3000 }))).toMatchObject({ stage: 'flush-ready', stopped: true });
    expect(follow(flushing, frame('idle', { at: 11000 }))).toMatchObject({ stage: 'cycle-ready', stopped: false });
  });

  it('a machine whose flush time is shorter than 10 s can still pass the step; a longer one is ended at 10 s', () => {
    const flushing = at('flush', { since: 0 });
    expect(follow(flushing, frame('idle', { at: 5000, flushDuration: 5 }))).toMatchObject({ stage: 'cycle-ready' });
    expect(follow(flushing, frame('idle', { at: 2000, flushDuration: 5 }))).toMatchObject({ stage: 'flush-ready' });
    expect(flushIsOver(flushing, FLUSH_SECONDS * 1000 - 1)).toBe(false);
    expect(flushIsOver(flushing, FLUSH_SECONDS * 1000)).toBe(true);
    expect(flushIsOver(at('cycle-ready'), FLUSH_SECONDS * 1000)).toBe(false);
  });

  it("the cycle follows Clean's milestones, and its end after the last one is done", () => {
    let cycle = at('cycle', { cycle: started(0) });
    expect(follow(cycle, frame('idle'))).toBe(cycle);
    for (const substate of ['cleaningStart', 'cleaningGroup', 'cleanSoaking', 'cleaningGroup']) {
      cycle = follow(cycle, frame('cleaning', { substate }));
    }
    expect(cycle.cycle).toMatchObject({ phase: 'running', milestone: CLEAN.milestones.length - 1 });
    const done = follow(cycle, frame('idle'));
    expect(done).toMatchObject({ stage: 'done', earlier: EARLIER });
    expect(detergentCaption(done, null)).toEqual({ text: 'Ready', tone: 'success' });
  });

  it('a cycle stopped before its end puts the card back at the last step; so does one that never started', () => {
    const soaking = follow(
      follow(at('cycle', { cycle: started(0) }), frame('cleaning', { substate: 'cleaningStart' })),
      frame('cleaning', { substate: 'cleanSoaking' }),
    );
    expect(follow(soaking, frame('idle'))).toMatchObject({ stage: 'cycle-ready', stopped: true });
    const late = follow(at('cycle', { cycle: started(0) }), frame('idle', { now: START_TIMEOUT_MS }));
    expect(late).toMatchObject({ stage: 'cycle-ready' });
    expect(detergentCaption(late, null)?.tone).toBe('error');
  });

  it("a cycle started from the card of 'Clean' or at the machine is the last step too", () => {
    expect(follow(at('cycle-ready', { cycle: IDLE }), frame('cleaning', { substate: 'cleaningStart' }))).toMatchObject({
      stage: 'cycle',
      cycle: { phase: 'running' },
    });
  });

  it('says what to do in each state, in the words of the profile while it runs', () => {
    expect(detergentCaption(NOT_STARTED, null)).toBeNull();
    expect(detergentCaption(at('run-ready'), null)?.text).toBe(`${DETERGENT_TITLE} is loaded: start it at the machine.`);
    expect(detergentCaption(at('run'), 'Pressure rise 3')).toEqual({ text: 'Pressure rise 3', tone: 'progress' });
    expect(detergentCaption(at('run'), null)?.text).toBe('Run');
    expect(detergentCaption(at('flush-ready'), null)?.text).toBe('Take the portafilter out and flush for 10 s.');
    expect(detergentCaption(at('flush'), null)?.text).toBe('Flush for 10 s');
    expect(detergentCaption(at('cycle-ready'), null)?.text).toBe("Last step: the machine's cleaning cycle.");
    expect(detergentCaption(at('cycle', { cycle: started(0) }), null)?.text).toBe('Starting');
  });

  it('keeps the screen and stops the machine only where it should', () => {
    expect(followsRun(at('run-ready'))).toBe(true);
    expect(followsRun(at('run'))).toBe(true);
    expect(followsRun(at('flush-ready'))).toBe(false);
    expect(followsRun(NOT_STARTED)).toBe(false);
    const runs = (['idle', 'run-ready', 'run', 'flush-ready', 'flush', 'cycle-ready', 'cycle', 'done'] as const).filter((stage) =>
      machineRuns(at(stage)),
    );
    expect(runs).toEqual(['run', 'flush', 'cycle']);
  });

  it('another profile loaded before the run ends the procedure; an unknown workflow does not', () => {
    expect(abandoned(at('run-ready'), 'Best practice')).toBe(true);
    expect(abandoned(at('run'), 'Best practice')).toBe(true);
    expect(abandoned(at('run-ready'), DETERGENT_TITLE)).toBe(false);
    expect(abandoned(at('run-ready'), undefined)).toBe(false);
    expect(abandoned(at('flush-ready'), 'Best practice')).toBe(false);
  });

  it('takes the profile, the target weight and the dose as the workflow had them, and gives them back', () => {
    const profile = { title: 'Mine, with edits', steps: [] } as unknown as Workflow['profile'];
    const earlier = earlierOf({ profile, context: { targetYield: 40, targetDoseWeight: 20 } });
    expect(restorePatch(earlier)).toEqual({ profile, context: { targetYield: 40, targetDoseWeight: 20 } });
  });

  it('a workflow without a target weight, a dose or a profile gives back what it had', () => {
    const earlier = earlierOf({ context: null });
    expect(earlier).toEqual({ profile: null, targetYield: 0, targetDoseWeight: null });
    expect(restorePatch(earlier)).toEqual({ context: { targetYield: 0, targetDoseWeight: null } });
  });

  it('survives a reload as it is stored, and anything else is not started', () => {
    const state = at('flush', { since: 5 });
    expect(readStored(JSON.stringify(state))).toEqual(state);
    expect(readStored(null)).toBe(NOT_STARTED);
    expect(readStored('not json')).toBe(NOT_STARTED);
    expect(readStored(JSON.stringify({ stage: 'run' }))).toBe(NOT_STARTED);
    expect(readStored(JSON.stringify({ ...state, earlier: null }))).toBe(NOT_STARTED);
  });
});
