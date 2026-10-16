// Hot water and flush on home (spec 3.6, the water view): snapshot frames in, the run's time
// and volume out, and the numbers the ring, the stream and the cup are drawn from. Pure: time
// comes from the frames' own timestamps, as in shot.ts and steam/run.ts.
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
  /** ml, the flow added up over the frames so far */
  volume: number;
  /** the machine has left the state */
  ended: boolean;
}

/**
 * The run after one machine frame. A frame in hot water or flush starts a run (and replaces a
 * finished one or one of the other kind) or adds to it; the first frame of another state ends
 * it. The volume adds each interval between two frames as the mean of their flows (trapezoid);
 * a clock that steps back adds nothing. Nothing is changed in place.
 */
export function recordWaterFrame(run: WaterRun | null, frame: MachineSnapshot): WaterRun | null {
  const kind = waterKindOf(frame.state.state);
  if (!kind) return run && !run.ended ? { ...run, ended: true } : run;
  const at = frameTime(frame.timestamp);
  const flow = Math.max(0, frame.flow);
  const temperature = frame.mixTemperature;
  if (!run || run.ended || run.kind !== kind) {
    return { kind, startedAt: at, at, flow, temperature, volume: 0, ended: false };
  }
  const dt = Math.max(0, (at - run.at) / 1000);
  return {
    ...run,
    at: Math.max(at, run.at),
    flow,
    temperature,
    volume: run.volume + ((run.flow + flow) / 2) * dt,
  };
}

/** s from the run's first frame to its latest */
export function waterSeconds(run: WaterRun): number {
  return Math.max(0, (run.at - run.startedAt) / 1000);
}

export interface WaterTarget {
  /** s; null when the workflow has none */
  duration: number | null;
  /** ml, hot water only; null for flush or when the workflow has none */
  volume: number | null;
}

const positive = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** The workflow's targets: `hotWaterData` for hot water, `rinseData` for flush. */
export function waterTarget(kind: WaterKind, workflow: Workflow | null): WaterTarget {
  if (kind === 'hotWater') {
    const data = workflow?.hotWaterData;
    return { duration: positive(data?.duration), volume: positive(data?.volume) };
  }
  return { duration: positive(workflow?.rinseData?.duration), volume: null };
}

export interface Ring {
  /** 0 to 1, the share of the ring drawn; 0 without a target duration */
  share: number;
  /** whole seconds so far */
  elapsed: number;
  /** whole seconds of the target, null without one */
  duration: number | null;
  /** e.g. 'Flush 6 / 10 s' */
  label: string;
}

/** The countdown ring around the stop button: the time so far against the target duration. */
export function ringOf(kind: WaterKind, seconds: number, duration: number | null): Ring {
  const elapsed = Math.floor(Math.max(0, seconds));
  const whole = duration === null ? null : Math.round(duration);
  const share = duration === null ? 0 : Math.min(1, Math.max(0, seconds / duration));
  const label = `${WATER_LABEL[kind]} ${elapsed}${whole === null ? '' : ` / ${whole}`} s`;
  return { share, elapsed, duration: whole, label };
}

export interface Cup {
  /** ml so far, or g with a scale */
  amount: number;
  unit: 'ml' | 'g';
  /** 0 to 1, how full the cup is drawn; 0 without a target volume */
  level: number;
}

/**
 * The hot-water cup: the scale's weight when a scale is connected (g is taken as ml), else the
 * volume added up from the flow, against the target volume.
 */
export function cupOf(volume: number, weight: number | null, target: number | null): Cup {
  const amount = Math.max(0, weight ?? volume);
  const level = target === null ? 0 : Math.min(1, amount / target);
  return { amount, unit: weight === null ? 'ml' : 'g', level };
}

/** ml/s from which the stream is drawn at full width and speed. */
export const FULL_FLOW = 10;
/** ml/s under which the stream stands still: the sensor's noise at rest. */
export const STILL_FLOW = 0.05;

export interface Stream {
  moving: boolean;
  /** 0 to 1 of the stream's full width; at least a thin line while it moves */
  width: number;
  /** s for one cycle of the stream's dashes; faster with more flow */
  period: number;
}

/** How the stream is drawn from the measured flow: wider and faster with more, still at 0. */
export function streamOf(flow: number): Stream {
  if (!(flow > STILL_FLOW)) return { moving: false, width: 0, period: 0 };
  const share = Math.min(1, flow / FULL_FLOW);
  return { moving: true, width: 0.15 + 0.85 * share, period: 0.25 + 1.75 * (1 - share) };
}

/**
 * The stream's colour from the mix temperature: the skin's flow blue at `COLD_C` and below,
 * its temperature red at `HOT_C` and above, mixed linearly in RGB in between.
 */
export const COLD_C = 20;
export const HOT_C = 90;
const COLD_RGB = [0x4d, 0xa3, 0xff];
const HOT_RGB = [0xff, 0x6b, 0x6b];

export function waterColour(celsius: number): string {
  const share = Number.isFinite(celsius) ? Math.min(1, Math.max(0, (celsius - COLD_C) / (HOT_C - COLD_C))) : 0;
  const rgb = COLD_RGB.map((cold, i) => Math.round(cold + (HOT_RGB[i] - cold) * share));
  return `rgb(${rgb.join(' ')})`;
}
