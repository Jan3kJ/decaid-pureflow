// The guided clean with detergent, in three steps: the profile 'Cleaning/Forward Flush x5', run
// by the user at the machine; one flush of 10 s without the portafilter; the machine's cleaning
// cycle. The skin starts no shot: it loads the profile and watches the machine's state. Pure: the
// frames in, the state out; `detergent-clean.svelte.ts` does the requests. No UI.
import type { MachineSnapshot, MachineState, Workflow, WorkflowPatch } from '../api';
import { CLEAN, IDLE, advance, caption, type Progress, type Tone } from './maintenance';

/** The title Decaid bundles the profile under. */
export const DETERGENT_TITLE = 'Cleaning/Forward Flush x5';
export const NOT_ON_MACHINE = 'the profile is not on this machine';
export const DETERGENT_MILESTONES = ['Run', 'Flush', 'Cleaning cycle'];
/** s, what the second step's flush lasts */
export const FLUSH_SECONDS = 10;
/** ms a flush may be short of its time and still count: frames come every half second */
const FLUSH_MARGIN_MS = 1000;
/**
 * ms after a run's end before the earlier profile may come back. Decaid's sequencer settles for up
 * to 4 s and only then decides on a record, by the workflow's profile at that moment: a cleaning
 * profile gets none, while the earlier one would get the run as its shot.
 */
export const RUN_SETTLE_MS = 5000;
/** The last of the cleaning cycle's milestones: a cycle left before it was stopped. */
const CYCLE_LAST = CLEAN.milestones.length - 1;

/** What the workflow held before the procedure's load. */
export interface Earlier {
  profile: Workflow['profile'] | null;
  /** g; 0 is off */
  targetYield: number;
  /** g */
  targetDoseWeight: number | null;
}

export const earlierOf = (workflow: Workflow): Earlier => ({
  profile: workflow.profile ?? null,
  targetYield: workflow.context?.targetYield ?? 0,
  targetDoseWeight: workflow.context?.targetDoseWeight ?? null,
});

/** The profile goes back as the workflow held it, its unsaved edits with it. */
export function restorePatch(earlier: Earlier): WorkflowPatch {
  const context = { targetYield: earlier.targetYield, targetDoseWeight: earlier.targetDoseWeight };
  return earlier.profile ? { profile: earlier.profile, context } : { context };
}

/**
 * - `idle`: not started
 * - `run-ready`, `run`: the profile is loaded, the machine waits for the user's start; it runs
 * - `flush-ready`, `flush`: the run has ended; the flush runs
 * - `cycle-ready`, `cycle`: the flush has ended, the cycle is offered; it was asked for or runs
 * - `done`: the cycle has ended
 */
export type Stage = 'idle' | 'run-ready' | 'run' | 'flush-ready' | 'flush' | 'cycle-ready' | 'cycle' | 'done';

export interface Detergent {
  stage: Stage;
  /** the last try of this step was stopped at the machine */
  stopped: boolean;
  /** the furthest step of the profile the run has reached, 0-based */
  step: number;
  /** ms, the first frame of the flush */
  since: number;
  /** the cleaning cycle, as the card of 'Clean' follows it */
  cycle: Progress;
  /** null once it is back on the machine */
  earlier: Earlier | null;
}

export const NOT_STARTED: Detergent = { stage: 'idle', stopped: false, step: 0, since: 0, cycle: IDLE, earlier: null };

export const begun = (earlier: Earlier): Detergent => ({ ...NOT_STARTED, stage: 'run-ready', earlier });

export interface DetergentFrame {
  state: MachineState;
  substate: string | null;
  profileFrame: number;
  /** ms, the frame's own time */
  at: number;
  /** ms, the clock, for the cycle's start timeout */
  now: number;
  /** 0-based, the profile's last step */
  lastStep: number;
  /** s, the time the machine ends a flush at; null when it is not known */
  flushDuration: number | null;
}

export function frameOf(
  frame: Pick<MachineSnapshot, 'state' | 'profileFrame'>,
  at: number,
  now: number,
  workflow: Workflow | null,
): DetergentFrame {
  const steps = workflow?.profile?.steps?.length;
  return {
    state: frame.state.state,
    substate: frame.state.substate,
    profileFrame: frame.profileFrame,
    at,
    now,
    lastStep: steps === undefined ? Infinity : steps - 1,
    flushDuration: workflow?.rinseData?.duration ?? null,
  };
}

/** The furthest step after a frame. Before the water moves the frame number may still be the last shot's. */
const stepOf = (frame: DetergentFrame, furthest: number) =>
  frame.substate === 'preparingForShot' ? furthest : Math.max(furthest, frame.profileFrame);

/** The state after a frame; the same object when nothing changed. */
export function follow(detergent: Detergent, frame: DetergentFrame): Detergent {
  const { state } = frame;
  switch (detergent.stage) {
    case 'run-ready':
      return state === 'espresso' ? { ...detergent, stage: 'run', stopped: false, step: stepOf(frame, 0) } : detergent;
    case 'run':
      // The machine passes through `skipStep` when the user skips a step at the machine.
      if (state === 'espresso' || state === 'skipStep') {
        return stepOf(frame, detergent.step) > detergent.step ? { ...detergent, step: frame.profileFrame } : detergent;
      }
      // Each step of the profile ends at its time, so a run that ended before the last was stopped.
      return detergent.step >= frame.lastStep
        ? { ...detergent, stage: 'flush-ready', stopped: false }
        : { ...detergent, stage: 'run-ready', stopped: true, step: 0 };
    case 'flush-ready':
      return state === 'flush' ? { ...detergent, stage: 'flush', stopped: false, since: frame.at } : detergent;
    case 'flush':
      if (state === 'flush') return detergent;
      return frame.at - detergent.since >= flushWanted(frame.flushDuration) - FLUSH_MARGIN_MS
        ? { ...detergent, stage: 'cycle-ready', stopped: false }
        : { ...detergent, stage: 'flush-ready', stopped: true };
    case 'cycle-ready':
      // Started from the card of 'Clean' or at the machine: the same cycle.
      return state === 'cleaning'
        ? { ...detergent, stage: 'cycle', stopped: false, cycle: advance(IDLE, { ...frame, state }, CLEAN) }
        : detergent;
    case 'cycle':
      return followCycle(detergent, frame);
    default:
      return detergent;
  }
}

function followCycle(detergent: Detergent, frame: DetergentFrame): Detergent {
  const cycle = advance(detergent.cycle, frame, CLEAN);
  if (cycle === detergent.cycle) return detergent;
  if (cycle.phase === 'done') {
    return detergent.cycle.milestone >= CYCLE_LAST
      ? { ...detergent, stage: 'done', cycle }
      : { ...detergent, stage: 'cycle-ready', stopped: true, cycle: IDLE };
  }
  if (cycle.phase === 'timeout') return { ...detergent, stage: 'cycle-ready', cycle };
  return { ...detergent, cycle };
}

/** ms, how long a flush must run to count: its 10 s, or the time the machine ends it at when that is shorter. */
const flushWanted = (duration: number | null) => Math.min(FLUSH_SECONDS, duration ?? FLUSH_SECONDS) * 1000;

/** The skin ends a flush at its 10 s when the machine's own time is longer. */
export const flushIsOver = (detergent: Detergent, at: number) =>
  detergent.stage === 'flush' && at - detergent.since >= FLUSH_SECONDS * 1000;

/** While the card waits for the run, another profile on the machine means the user went on without it. */
export const abandoned = (detergent: Detergent, title: string | undefined) =>
  (detergent.stage === 'run-ready' || detergent.stage === 'run') && title !== undefined && title !== DETERGENT_TITLE;

/** A run that starts leaves the user at the card, where home would open otherwise. */
export const followsRun = (detergent: Detergent) => detergent.stage === 'run-ready' || detergent.stage === 'run';

/** The machine runs something that cancel must stop first. */
export const machineRuns = (detergent: Detergent) =>
  detergent.stage === 'run' || detergent.stage === 'flush' || detergent.stage === 'cycle';

/** The step that is at hand, or all of them done; -1 before the start. */
export function milestoneOf(detergent: Detergent): number {
  switch (detergent.stage) {
    case 'idle':
      return -1;
    case 'run-ready':
    case 'run':
      return 0;
    case 'flush-ready':
    case 'flush':
      return 1;
    case 'cycle-ready':
    case 'cycle':
      return 2;
    case 'done':
      return DETERGENT_MILESTONES.length;
  }
}

/** The line under the steps; null before the start. `stepName` is the profile's name of the step that runs. */
export function detergentCaption(detergent: Detergent, stepName: string | null): { text: string; tone: Tone } | null {
  const again = detergent.stopped ? 'Stopped at the machine. ' : '';
  switch (detergent.stage) {
    case 'idle':
      return null;
    case 'run-ready':
      return { text: `${again}${DETERGENT_TITLE} is loaded: start it at the machine.`, tone: 'info' };
    case 'run':
      return { text: stepName ?? DETERGENT_MILESTONES[0], tone: 'progress' };
    case 'flush-ready':
      return { text: `${again}Take the portafilter out and flush for ${FLUSH_SECONDS} s.`, tone: 'info' };
    case 'flush':
      return { text: `Flush for ${FLUSH_SECONDS} s`, tone: 'progress' };
    case 'cycle-ready':
      if (detergent.cycle.phase === 'timeout') return caption(detergent.cycle, CLEAN);
      return { text: `${again}Last step: the machine's cleaning cycle.`, tone: 'info' };
    case 'cycle':
      return caption({ ...detergent.cycle, stale: false }, CLEAN);
    case 'done':
      return { text: CLEAN.ready, tone: 'success' };
  }
}

/** What is stored for a reload is a state of this procedure with the earlier profile in it, else nothing. */
export function readStored(text: string | null): Detergent {
  try {
    const stored = JSON.parse(text ?? 'null') as Partial<Detergent> | null;
    if (stored?.earlier && stored.stage && stored.stage !== 'idle' && stored.cycle) return { ...NOT_STARTED, ...stored };
  } catch {
    // not this procedure's: not started
  }
  return NOT_STARTED;
}
