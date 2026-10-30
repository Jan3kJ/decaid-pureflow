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
  /** ml/s */
  flow: number[];
}

export interface SteamRun {
  /** ms, the first frame's timestamp */
  startedAt: number;
  series: SteamSeries;
  /** the steam is over: the graph is finished */
  ended: boolean;
  /** the run started with the substate `pouring`: leaving it, or the fall of the flow, ends it */
  pouring: boolean;
  /** the flow has been at `STEAM_FLOW` or more (the hysteresis of the end) */
  flowed: boolean;
  /** the machine is still in the state steam of this run: no new run starts before it leaves */
  inSteam: boolean;
}

export function emptySteamSeries(): SteamSeries {
  return { t: [], pressure: [], temperature: [], flow: [] };
}

/**
 * ml/s: the steam ends with the last frame of `pouring` at this flow or more. On the real DE1
 * the flow falls under it about 0.5 s after the machine's timer, while the substate stays
 * `pouring` for 3.5 to 5 s more.
 */
export const STEAM_FLOW = 0.5;

/**
 * The substates in which a machine still in state steam has stopped steaming
 * (`MachineSubstate` in rest_v1.yml): `pouringDone` as the steam ends, `puffing` while it
 * purges and `pausedSteam` until the second tap of the two-tap purge. The real DE1 passes
 * them before idle; the simulated one goes from steam to idle at once.
 */
const STEAM_OVER: readonly string[] = ['pouringDone', 'puffing', 'pausedSteam'];

/**
 * The machine steams in this frame: state steam, neither before the steam (`preparingForShot`,
 * the pump priming) nor after it. The real DE1 steams in `pouring`; the simulated machine
 * reports none of its substates and steams in `idle`.
 */
export function steams(frame: Pick<MachineSnapshot, 'state'>): boolean {
  const { state, substate } = frame.state;
  return state === 'steam' && substate !== 'preparingForShot' && !STEAM_OVER.includes(substate);
}

/** The frame goes on with the running run. */
function continues(run: SteamRun, frame: MachineSnapshot): boolean {
  if (!run.pouring) return steams(frame);
  return frame.state.state === 'steam' && frame.state.substate === 'pouring' && !(run.flowed && frame.flow < STEAM_FLOW);
}

/**
 * The run after one machine frame. It starts with the first frame that steams:
 * the first of `pouring`, or of a machine that never reports it. A run started in `pouring`
 * ends with the last frame at `STEAM_FLOW` or more, once the flow has been there, or when the
 * substate leaves `pouring`; any run ends when the machine leaves steam or passes to a
 * substate after the steam. Frames after the end are neither drawn nor counted, and the next
 * run starts only after the machine has left steam. Nothing is changed in place.
 */
export function recordSteamFrame(run: SteamRun | null, frame: MachineSnapshot): SteamRun | null {
  const inSteam = frame.state.state === 'steam';
  if (run && !run.ended) {
    if (!continues(run, frame)) return { ...run, ended: true, inSteam };
    return addPoint(run, frame);
  }
  if (run?.inSteam) return inSteam ? run : { ...run, inSteam: false };
  if (!steams(frame)) return run;
  const at = frameTime(frame.timestamp);
  const started: SteamRun = {
    startedAt: at,
    series: emptySteamSeries(),
    ended: false,
    pouring: frame.state.substate === 'pouring',
    flowed: false,
    inSteam: true,
  };
  return addPoint(started, frame);
}

function addPoint(run: SteamRun, frame: MachineSnapshot): SteamRun {
  const s = run.series;
  // A clock that steps back must not draw a line to the left.
  const t = Math.max((frameTime(frame.timestamp) - run.startedAt) / 1000, s.t.at(-1) ?? 0);
  return {
    ...run,
    flowed: run.flowed || frame.flow >= STEAM_FLOW,
    series: {
      t: [...s.t, t],
      pressure: [...s.pressure, frame.pressure],
      temperature: [...s.temperature, frame.steamTemperature],
      flow: [...s.flow, frame.flow],
    },
  };
}

/** Seconds from the first to the latest steam frame. */
export function steamSeconds(run: SteamRun | null): number {
  return run?.series.t.at(-1) ?? 0;
}

/**
 * The countdown of a running steam: the whole seconds left of `timer` after
 * `elapsed`, never under 0. It starts at the timer itself.
 */
export function secondsLeft(timer: number, elapsed: number): number {
  return Math.max(0, Math.ceil(timer - elapsed - 1e-9));
}
