// Hot water and flush on every screen (spec 3.6, 3.7, 3.14: the water view): snapshot frames in, the run's
// time out, and the countdown ring and the values the stop button shows. Pure: time comes from
// the frames' own timestamps, as in shot.ts and steam/run.ts.
import type { MachineSnapshot, Workflow } from '../api';
import { frameTime } from './shot';

/** The two machine states the water view draws (research.md 19). */
export type WaterKind = 'hotWater' | 'flush';

export const WATER_LABEL: Record<WaterKind, string> = { hotWater: 'Hot water', flush: 'Flush' };

export function waterKindOf(state: string): WaterKind | null {
  return state === 'hotWater' || state === 'flush' ? state : null;
}

export interface WaterRun {
  kind: WaterKind;
  /** ms, the first frame's timestamp */
  startedAt: number;
  /** ms, the latest frame's timestamp */
  at: number;
  /** ml/s, the latest frame's flow */
  flow: number;
  /** °C, the latest frame's mix temperature */
  temperature: number;
  /** the machine has left the state */
  ended: boolean;
}

/**
 * The run after one machine frame. A frame in hot water or flush starts a run (and replaces a
 * finished one or one of the other kind) or adds to it; the first frame of another state ends
 * it. A clock that steps back does not move the run's time back. Nothing is changed in place.
 */
export function recordWaterFrame(run: WaterRun | null, frame: MachineSnapshot): WaterRun | null {
  const kind = waterKindOf(frame.state.state);
  if (!kind) return run && !run.ended ? { ...run, ended: true } : run;
  const at = frameTime(frame.timestamp);
  const flow = Math.max(0, frame.flow);
  const temperature = frame.mixTemperature;
  if (!run || run.ended || run.kind !== kind) {
    return { kind, startedAt: at, at, flow, temperature, ended: false };
  }
  return { ...run, at: Math.max(at, run.at), flow, temperature };
}

/** The run the shell draws as the ring: one that has not ended while the machine can be stopped; else null. */
export function shownRun(run: WaterRun | null, canStop: boolean): WaterRun | null {
  return canStop && run && !run.ended ? run : null;
}

/** s from the run's first frame to its latest */
export function waterSeconds(run: WaterRun): number {
  return Math.max(0, (run.at - run.startedAt) / 1000);
}

/**
 * s, the workflow's target duration: `hotWaterData` for hot water, `rinseData` for flush; null
 * when the workflow has none (or 0).
 */
export function waterDuration(kind: WaterKind, workflow: Workflow | null): number | null {
  const value = kind === 'hotWater' ? workflow?.hotWaterData?.duration : workflow?.rinseData?.duration;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export interface Ring {
  /** 0 to 1, the share of the ring drawn; 0 without a target duration */
  share: number;
  /** whole seconds so far */
  elapsed: number;
  /** whole seconds of the target, null without one */
  duration: number | null;
  /** e.g. '6 / 10 s', or '6 s' without a target */
  time: string;
}

/** The countdown ring around the stop button: the time so far against the target duration. */
export function ringOf(seconds: number, duration: number | null): Ring {
  const elapsed = Math.floor(Math.max(0, seconds));
  const whole = duration === null ? null : Math.round(duration);
  const share = duration === null ? 0 : Math.min(1, Math.max(0, seconds / duration));
  const time = `${elapsed}${whole === null ? '' : ` / ${whole}`} s`;
  return { share, elapsed, duration: whole, time };
}

export interface WaterValues {
  /** e.g. '75 °C', the mix temperature */
  temperature: string;
  /** e.g. '6.0 ml/s' */
  flow: string;
  /** e.g. '6 / 10 s', the ring's time */
  time: string;
  /** e.g. '31.4 g', the scale's weight; hot water with a connected scale only */
  weight: string | null;
}

const shown = (value: number, digits: number): string => (Number.isFinite(value) ? value.toFixed(digits) : '–');

/**
 * What the stop button shows inside the ring (spec 3.7): temperature, flow and time, and for
 * hot water the scale's weight in g when a scale sends one (`weight` is null without a scale).
 * Flow and weight below 0 (sensor noise at rest, a weight after a tare) show as 0; a value the
 * machine did not send as '–'.
 */
export function waterValues(run: WaterRun, ring: Ring, weight: number | null): WaterValues {
  return {
    temperature: `${shown(run.temperature, 0)} °C`,
    flow: `${shown(Math.max(0, run.flow), 1)} ml/s`,
    time: ring.time,
    weight: run.kind === 'hotWater' && weight !== null ? `${shown(Math.max(0, weight), 1)} g` : null,
  };
}
