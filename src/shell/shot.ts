// Snapshot frames in, the series of a shot graph out: plain arrays, one value per machine
// frame. Pure: no clock, no network. Time comes from the frames' own timestamps.
import type { MachineSnapshot } from '../api';
import { phaseSample, type PhaseSample } from './phases';

/** What the graph draws. Every array is as long as `t`. */
export interface ShotSeries {
  /** s since the first frame in which water moved */
  t: number[];
  /** bar */
  pressure: number[];
  /** ml/s */
  flow: number[];
  /** g, from the scale stream; null without a scale or while its weight is not the cup's yet */
  weight: (number | null)[];
  /**
   * g/s, the scale frame's `weightFlow`: the scale's own gravimetric flow, or Decaid's
   * smoothed estimate from the weight (websocket_v1.yml). The graph draws this, not the
   * weight (founder, 2026-10-14). Null where the weight is null.
   */
  weightFlow: (number | null)[];
  /** °C at the group */
  temperature: number[];
  /** bar, the profile's target; null while the step does not control the pressure */
  targetPressure: (number | null)[];
  /** ml/s, the profile's target; null while the step does not control the flow */
  targetFlow: (number | null)[];
  /** °C at the group, the profile's target; null without one */
  targetTemperature: (number | null)[];
}

export interface Shot {
  /** ms, the timestamp of the first espresso frame: Decaid tares the scale then */
  enteredAt: number;
  /** ms, the timestamp of the first frame in which water moved; null while the machine still heats */
  startedAt: number | null;
  series: ShotSeries;
  /** the frames the per-phase table counts (`phaseTable` in phases.ts), with the scale's raw weight */
  samples: PhaseSample[];
  /**
   * g, the weight in the cup after the shot: the highest weight the scale showed since the
   * shot ended (`settleWeight`), so the drops after the stop count and taking the cup away
   * does not. Null while the shot runs.
   */
  finalWeight: number | null;
  /** the shot is over (`shotOver`): the graph is finished and the timer stands */
  ended: boolean;
  /**
   * the machine has left espresso since; until then the espresso frames after the shot (its
   * tail) are not a new shot. Missing counts as true.
   */
  left?: boolean;
}

/**
 * Decaid tares the scale when a shot starts; on the rig the weight was 0 half a second after
 * the first espresso frame (research.md, section 10). Until then the scale still shows what
 * stood on it, so the weight of the first second in espresso is not drawn.
 */
export const TARE_SETTLE_S = 1;

/**
 * The substates of state espresso in which no water moves yet (`MachineSubstate` in
 * rest_v1.yml): a real DE1 enters espresso and heats for seconds before it pumps, and Decaid
 * names that `preparingForShot`. Any other substate (`preinfusion`, `pouring`,
 * `pouringDone`, one a newer Decaid adds) counts as water moving.
 */
const WAITING: readonly string[] = ['idle', 'preparingForShot'];

/**
 * The substates of state espresso after the shot (spec 3.8): the real DE1 stays in espresso
 * for seconds after the stop, in `pouringDone` (`MachineSubstate` in rest_v1.yml; the
 * firmware's own name for it is Ending), and pumps towards other targets meanwhile: the tail
 * of the founder's screenshot of 2026-10-17. 'ending' is there for a gateway that uses the
 * firmware's name. The simulated machine goes from `pouring` to idle at once and sends none
 * of them (research.md 23). The steam run treats its own end so (`steams` in steam/run.ts).
 */
const SHOT_DONE: readonly string[] = ['pouringDone', 'ending'];

/**
 * The shot is over in this frame: another state, or one of the substates after the shot.
 * Where the live graph and the timer end, and where the history's graph ends (`seriesOf`).
 */
export function shotOver(frame: Pick<MachineSnapshot, 'state'>): boolean {
  return frame.state.state !== 'espresso' || SHOT_DONE.includes(frame.state.substate);
}

/** Water moves in this frame: where the graph and the shot timer start. */
export function waterMoves(frame: Pick<MachineSnapshot, 'state'>): boolean {
  return frame.state.state === 'espresso' && !WAITING.includes(frame.state.substate);
}

/** A frame's timestamp is local time without a zone; only differences are used. */
export function frameTime(timestamp: string): number {
  return new Date(timestamp).getTime();
}

export function emptySeries(): ShotSeries {
  return {
    t: [],
    pressure: [],
    flow: [],
    weight: [],
    weightFlow: [],
    temperature: [],
    targetPressure: [],
    targetFlow: [],
    targetTemperature: [],
  };
}

/** A target of 0 is the quantity the step does not control: a gap, not a line at 0. */
const target = (value: number | undefined): number | null => (typeof value === 'number' && value > 0 ? value : null);

/** Adds one point to a series, in place: what a frame gives the graph at the time `t`. */
export function pushPoint(
  series: ShotSeries,
  t: number,
  frame: MachineSnapshot,
  weight: number | null,
  weightFlow: number | null,
): void {
  series.t.push(t);
  series.pressure.push(frame.pressure);
  series.flow.push(frame.flow);
  series.weight.push(weight);
  series.weightFlow.push(weight === null ? null : weightFlow);
  series.temperature.push(frame.groupTemperature);
  series.targetPressure.push(target(frame.targetPressure));
  series.targetFlow.push(target(frame.targetFlow));
  series.targetTemperature.push(target(frame.targetGroupTemperature));
}

/**
 * The shot after one machine frame. A frame in state espresso starts a shot (and replaces a
 * finished one) or adds a point; the first frame in which the shot is over (`shotOver`: another
 * state, or `pouringDone` after the stop) ends it and adds no point, so the graph and the timer
 * stop there (spec 3.8). Espresso frames after that, until the machine leaves espresso, are the
 * shot's tail and change nothing. The graph and the timer start with the first frame in which
 * water moves (`waterMoves`): the frames of the heating before it give no points. After that
 * every espresso frame is a point until the end, whatever its substate (the simulated machine
 * goes back to `preparingForShot` between two steps, research.md 8.2). `weight` is the scale's
 * latest weight, null without a scale, and `weightFlow` its latest weight flow in g/s. Nothing
 * is changed in place.
 */
export function recordFrame(
  shot: Shot | null,
  frame: MachineSnapshot,
  weight: number | null,
  weightFlow: number | null = null,
): Shot | null {
  if (frame.state.state !== 'espresso') {
    return shot && !(shot.ended && shot.left !== false) ? { ...shot, ended: true, left: true } : shot;
  }
  if (shot?.ended && shot.left === false) return shot;
  if (shotOver(frame)) {
    return shot && !shot.ended ? { ...shot, ended: true, left: false } : shot;
  }
  const at = frameTime(frame.timestamp);
  const running: Shot =
    shot && !shot.ended
      ? shot
      : { enteredAt: at, startedAt: null, series: emptySeries(), samples: [], finalWeight: null, ended: false };
  if (running.startedAt === null && !waterMoves(frame)) return running;
  const sample = phaseSample(frame, weight);
  const startedAt = running.startedAt ?? at;
  const s = running.series;
  // A clock that steps back must not draw a line to the left.
  const t = Math.max((at - startedAt) / 1000, s.t.at(-1) ?? 0);
  const series: ShotSeries = {
    t: [...s.t],
    pressure: [...s.pressure],
    flow: [...s.flow],
    weight: [...s.weight],
    weightFlow: [...s.weightFlow],
    temperature: [...s.temperature],
    targetPressure: [...s.targetPressure],
    targetFlow: [...s.targetFlow],
    targetTemperature: [...s.targetTemperature],
  };
  const settled = (at - running.enteredAt) / 1000 >= TARE_SETTLE_S;
  pushPoint(series, t, frame, settled ? weight : null, weightFlow);
  return { ...running, startedAt, series, samples: sample ? [...running.samples, sample] : running.samples };
}

/**
 * The shot after a scale weight: a finished shot keeps the highest weight since it ended as
 * the weight in the cup. Streamline follows the scale after the shot (`setFinalWeight` in its
 * shotData.js); the highest weight keeps the drops after the stop but not a cup taken away
 * while the summary is still open (spec 3.8, T2). Nothing is changed in place.
 */
export function settleWeight(shot: Shot | null, weight: number | null): Shot | null {
  if (!shot?.ended || weight === null) return shot;
  const held = shot.finalWeight ?? shotWeight(shot) ?? weight;
  return weight > held || shot.finalWeight === null ? { ...shot, finalWeight: Math.max(held, weight) } : shot;
}

/** The shot timer: seconds from the first frame in which water moved to the latest frame. */
export function shotSeconds(shot: Shot | null): number {
  return shot?.series.t.at(-1) ?? 0;
}

/** The latest weight in the shot's series, null before the scale's first one. */
export function shotWeight(shot: Shot | null): number | null {
  return shot ? seriesWeight(shot.series) : null;
}

/** The latest weight in a series, null when it has none. */
export function seriesWeight(series: ShotSeries): number | null {
  const weights = series.weight;
  for (let i = weights.length - 1; i >= 0; i -= 1) {
    const weight = weights[i];
    if (weight !== null) return weight;
  }
  return null;
}
