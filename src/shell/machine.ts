// What the skin says about the gateway and the machine, from what the snapshot stream
// delivered. Nothing here is assumed: without a fresh frame there is no machine state.
import type { MachineSnapshot, MachineState, StreamState } from '../api';

/** Whether the gateway answers: not known until the stream opened or failed once. */
export type Gateway = 'connecting' | 'connected' | 'lost';

export function gatewayAfter(before: Gateway, stream: StreamState): Gateway {
  if (stream === 'open') return 'connected';
  if (stream === 'waiting' || stream === 'failed') return 'lost';
  // 'connecting' between two attempts keeps what the last attempt showed.
  return before;
}

/**
 * - `connecting`: nothing is known yet
 * - `no-gateway`: the stream's socket does not open
 * - `no-machine`: the socket is open and silent
 * - `machine`: frames arrive
 */
export type Link = 'connecting' | 'no-gateway' | 'no-machine' | 'machine';

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
 * state (asleep, heating, no machine) there is nothing to start; waking is the sleep button's
 * job (D8c).
 */
export type HomeAction = 'start' | 'stop' | 'none';

export function homeAction(link: Link, snapshot: MachineSnapshot | null): HomeAction {
  if (link !== 'machine' || !snapshot) return 'none';
  if (snapshot.state.state === 'idle') return 'start';
  return RUNNING.includes(snapshot.state.state) ? 'stop' : 'none';
}
