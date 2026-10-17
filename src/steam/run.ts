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
 * The substates in which a machine still in state steam has stopped steaming
 * (`MachineSubstate` in rest_v1.yml): `pouringDone` as the steam ends, `puffing` while it
 * purges and `pausedSteam` until the second tap of the two-tap purge. The real DE1 passes
 * them before idle; the simulated one goes from steam to idle at once (research.md 8.7).
 */
const STEAM_OVER: readonly string[] = ['pouringDone', 'puffing', 'pausedSteam'];

/** The machine steams in this frame. */
export function steams(frame: Pick<MachineSnapshot, 'state'>): boolean {
  return frame.state.state === 'steam' && !STEAM_OVER.includes(frame.state.substate);
}

/**
 * The run after one machine frame. A frame that steams starts a run (and replaces a
 * finished one) or adds a point; the first frame that does not ends it: another state, or
 * one of the substates after the steam (spec 3.7: the graph and the time stop with the
 * steam). Nothing is changed in place.
 */
export function recordSteamFrame(run: SteamRun | null, frame: MachineSnapshot): SteamRun | null {
  if (!steams(frame)) {
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

/**
 * The countdown of a running steam (spec 3.7): the whole seconds left of `timer` after
 * `elapsed`, never under 0. It starts at the timer itself.
 */
export function secondsLeft(timer: number, elapsed: number): number {
  return Math.max(0, Math.ceil(timer - elapsed - 1e-9));
}
