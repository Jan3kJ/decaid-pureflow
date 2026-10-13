// What the skin says about the gateway and the machine, from what the snapshot stream
// delivered. Nothing here is assumed: without a fresh frame there is no machine state.
import type { MachineSnapshot, MachineState, StreamState } from '../api';

/**
 * Whether the gateway answers: not known until the stream opened or failed once. `refused`:
 * the gateway sent an error frame and closed the socket, and the stream does not try again
 * by itself (research.md 9.4).
 */
export type Gateway = 'connecting' | 'connected' | 'lost' | 'refused';

export function gatewayAfter(before: Gateway, stream: StreamState): Gateway {
  if (stream === 'open') return 'connected';
  if (stream === 'failed') return 'refused';
  if (stream === 'waiting') return 'lost';
  // 'connecting' between two attempts keeps what the last attempt showed.
  return before;
}

/**
 * - `connecting`: nothing is known yet
 * - `no-gateway`: the stream's socket does not open
 * - `refused`: the gateway closed the stream with an error; only 'reconnect' opens it again
 * - `no-machine`: the socket is open and silent
 * - `machine`: frames arrive
 */
export type Link = 'connecting' | 'no-gateway' | 'refused' | 'no-machine' | 'machine';

/**
 * A machine sends at least 2 frames per second. Without a machine the gateway keeps the
 * socket open and sends nothing (research.md, section 10), so silence is the sign.
 */
export const FRAME_STALE_MS = 3000;

/** `openedAt` and `lastFrameAt` are times of the skin's own clock, as `now` is. */
export function linkOf(
  gateway: Gateway,
  openedAt: number | null,
  lastFrameAt: number | null,
  now: number,
): Link {
  if (gateway === 'connecting') return 'connecting';
  if (gateway === 'refused') return 'refused';
  if (gateway === 'lost' || openedAt === null) return 'no-gateway';
  const fresh = lastFrameAt !== null && lastFrameAt >= openedAt;
  if (now - (fresh ? lastFrameAt : openedAt) > FRAME_STALE_MS) return 'no-machine';
  return fresh ? 'machine' : 'connecting';
}

const STATE_LABEL: Record<MachineState, string> = {
  booting: 'Starting',
  busy: 'Busy',
  idle: 'Idle',
  sleeping: 'Asleep',
  heating: 'Heating',
  preheating: 'Preheating',
  espresso: 'Espresso',
  hotWater: 'Hot water',
  flush: 'Flush',
  steam: 'Steam',
  steamRinse: 'Steam rinse',
  skipStep: 'Next step',
  cleaning: 'Cleaning',
  descaling: 'Descaling',
  calibration: 'Calibration',
  selfTest: 'Self test',
  airPurge: 'Air purge',
  needsWater: 'Needs water',
  error: 'Error',
  fwUpgrade: 'Firmware update',
};

/** A state this version does not know is shown as the machine names it. */
export function stateLabel(state: string): string {
  return (STATE_LABEL as Record<string, string>)[state] ?? state;
}

export type Tone = 'ok' | 'busy' | 'warn' | 'off';

export interface Status {
  title: string;
  detail: string;
  tone: Tone;
}

const RUNNING: readonly MachineState[] = ['espresso', 'steam', 'hotWater', 'flush', 'steamRinse'];
const WARN: readonly MachineState[] = ['needsWater', 'error'];

export function statusOf(link: Link, snapshot: MachineSnapshot | null, gatewayUrl: string): Status {
  if (link === 'connecting') return { title: 'Connecting', detail: gatewayUrl, tone: 'off' };
  if (link === 'no-gateway') {
    return {
      title: 'Decaid is not reachable',
      detail: `No answer from ${gatewayUrl}. Trying again.`,
      tone: 'warn',
    };
  }
  if (link === 'refused') {
    return {
      title: 'Decaid closed the connection',
      detail: 'It answered with an error and is not asked again. Reconnect to try once more.',
      tone: 'warn',
    };
  }
  if (link === 'no-machine' || !snapshot) {
    return {
      title: 'No machine connected',
      detail: 'Decaid answers, the machine does not. Connect it in Decaid.',
      tone: 'warn',
    };
  }
  const state = snapshot.state.state;
  return {
    title: stateLabel(state),
    detail: `group ${snapshot.groupTemperature.toFixed(1)} °C, set to ${snapshot.targetGroupTemperature.toFixed(0)} °C`,
    tone: WARN.includes(state) ? 'warn' : RUNNING.includes(state) ? 'busy' : state === 'idle' ? 'ok' : 'off',
  };
}

/**
 * The one large button of home: start a shot from idle, stop whatever runs. In every other
 * state (asleep, heating, no machine) there is nothing to start; a sleeping machine is woken
 * by a touch (`isAsleep`).
 */
export type HomeAction = 'start' | 'stop' | 'none';

export function homeAction(link: Link, snapshot: MachineSnapshot | null): HomeAction {
  if (link !== 'machine' || !snapshot) return 'none';
  if (snapshot.state.state === 'idle') return 'start';
  return RUNNING.includes(snapshot.state.state) ? 'stop' : 'none';
}

/** The sleep button of home: a machine that is awake and runs nothing can be put to sleep. */
export function canSleep(link: Link, snapshot: MachineSnapshot | null): boolean {
  if (link !== 'machine' || !snapshot) return false;
  const state = snapshot.state.state;
  return state !== 'sleeping' && !RUNNING.includes(state);
}

/** The machine said that it sleeps: the skin goes dark and a touch anywhere wakes it. */
export function isAsleep(link: Link, snapshot: MachineSnapshot | null): boolean {
  return link === 'machine' && snapshot?.state.state === 'sleeping';
}

/** What the scale stream said last about the scale; `unknown` while the stream is not open. */
export type ScaleLink = 'unknown' | 'connected' | 'disconnected';

export const SCALE_LABEL: Record<ScaleLink, string> = {
  unknown: 'Not known',
  connected: 'Connected',
  disconnected: 'Not connected',
};
