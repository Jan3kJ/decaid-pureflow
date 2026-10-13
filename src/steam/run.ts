// Snapshot frames in, the series of the steam graph out, as shot.ts does it for a shot. Pure:
// time comes from the frames' own timestamps.
import type { MachineSnapshot } from '../api';
import { frameTime } from '../shell/shot';

/** What the steam graph draws. Every array is as long as `t`. */
export interface SteamSeries {
  /** s since the first steam frame */
  t: number[];
  /** bar */
  pressure: number[];
  /** °C of the steam heater */
  temperature: number[];
}

export interface SteamRun {
  /** ms, the first frame's timestamp */
  startedAt: number;
  series: SteamSeries;
  /** the machine has left steam: the graph is finished */
  ended: boolean;
}

export function emptySteamSeries(): SteamSeries {
  return { t: [], pressure: [], temperature: [] };
}

/**
 * The run after one machine frame. A frame in state steam starts a run (and replaces a
 * finished one) or adds a point; the first frame of another state ends it. Nothing is
 * changed in place.
 */
export function recordSteamFrame(run: SteamRun | null, frame: MachineSnapshot): SteamRun | null {
  if (frame.state.state !== 'steam') {
    return run && !run.ended ? { ...run, ended: true } : run;
  }
  const at = frameTime(frame.timestamp);
  const running = run && !run.ended ? run : { startedAt: at, series: emptySteamSeries(), ended: false };
  const s = running.series;
  // A clock that steps back must not draw a line to the left.
  const t = Math.max((at - running.startedAt) / 1000, s.t.at(-1) ?? 0);
  return {
    ...running,
    series: {
      t: [...s.t, t],
      pressure: [...s.pressure, frame.pressure],
      temperature: [...s.temperature, frame.steamTemperature],
    },
  };
}

/** Seconds from the first to the latest steam frame. */
export function steamSeconds(run: SteamRun | null): number {
  return run?.series.t.at(-1) ?? 0;
}
