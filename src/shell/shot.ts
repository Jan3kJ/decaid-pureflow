// Snapshot frames in, the series of a shot graph out: plain arrays, one value per machine
// frame. Pure: no clock, no network. Time comes from the frames' own timestamps.
import type { MachineSnapshot } from '../api';

/** What the graph draws. Every array is as long as `t`. */
export interface ShotSeries {
  /** s since the first frame of the shot */
  t: number[];
  /** bar */
  pressure: number[];
  /** ml/s */
  flow: number[];
  /** g, from the scale stream; null without a scale or while its weight is not the cup's yet */
  weight: (number | null)[];
  /** °C at the group */
  temperature: number[];
}

export interface Shot {
  /** ms, the first frame's timestamp */
  startedAt: number;
  series: ShotSeries;
  /** the machine has left espresso: the graph is finished */
  ended: boolean;
}

/**
 * Decaid tares the scale when a shot starts; on the rig the weight was 0 half a second after
 * the first espresso frame (research.md, section 10). Until then the scale still shows what
 * stood on it, so the weight of the first second is not drawn.
 */
export const TARE_SETTLE_S = 1;

/** A frame's timestamp is local time without a zone; only differences are used. */
export function frameTime(timestamp: string): number {
  return new Date(timestamp).getTime();
}

export function emptySeries(): ShotSeries {
  return { t: [], pressure: [], flow: [], weight: [], temperature: [] };
}

/**
 * The shot after one machine frame. A frame in state espresso starts a shot (and replaces a
 * finished one) or adds a point; the first frame of another state ends it. `weight` is the
 * scale's latest weight, null without a scale. Nothing is changed in place.
 */
export function recordFrame(shot: Shot | null, frame: MachineSnapshot, weight: number | null): Shot | null {
  if (frame.state.state !== 'espresso') {
    return shot && !shot.ended ? { ...shot, ended: true } : shot;
  }
  const at = frameTime(frame.timestamp);
  const running = shot && !shot.ended ? shot : { startedAt: at, series: emptySeries(), ended: false };
  const s = running.series;
  // A clock that steps back must not draw a line to the left.
  const t = Math.max((at - running.startedAt) / 1000, s.t.at(-1) ?? 0);
  return {
    ...running,
    series: {
      t: [...s.t, t],
      pressure: [...s.pressure, frame.pressure],
      flow: [...s.flow, frame.flow],
      weight: [...s.weight, t < TARE_SETTLE_S ? null : weight],
      temperature: [...s.temperature, frame.groupTemperature],
    },
  };
}

/** The shot timer: seconds from the first to the latest frame. */
export function shotSeconds(shot: Shot | null): number {
  return shot?.series.t.at(-1) ?? 0;
}

/** The latest weight in the shot's series, null before the scale's first one. */
export function shotWeight(shot: Shot | null): number | null {
  const weights = shot?.series.weight ?? [];
  for (let i = weights.length - 1; i >= 0; i -= 1) {
    const weight = weights[i];
    if (weight !== null) return weight;
  }
  return null;
}
