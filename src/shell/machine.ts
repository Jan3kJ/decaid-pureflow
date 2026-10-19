// What the skin says about the gateway and the machine, from what the snapshot stream
// delivered. Nothing here is assumed: without a fresh frame there is no machine state.
import type { MachineSnapshot, MachineState, ShotSettings, StreamState, WaterLevels } from '../api';

/**
 * Whether the gateway answers: not known until the stream opened or failed once. `refused`:
 * the gateway sent an error frame and closed the socket, and still did so after the stream
 * tried again for 30 s (`REFUSED_RETRY_MS`, founder 2026-10-15); while it tries the gateway
 * is `lost`.
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
      detail: 'It answered with an error for 30 s of tries. Reconnect to try again.',
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

/** °C under its target from which a heater counts as heated (founder, 2026-10-17) */
export const HEATED_MARGIN = 3;

/** The heater a page's state line waits for: home the group's, the steam page the steam heater's. */
export type HeatTarget = 'group' | 'steam';

/**
 * The DE1 says `idle` while it heats, so the skin derives it (spec 3.8): an idle machine whose
 * heater is more than `HEATED_MARGIN` under its target. The steam target is the machine's own
 * (`targetSteamTemp` of its settings); a heater that is off (0) or not known is not heating.
 */
export function isHeating(snapshot: MachineSnapshot | null, target: HeatTarget, settings: ShotSettings | null): boolean {
  if (!snapshot || snapshot.state.state !== 'idle') return false;
  if (target === 'group') return snapshot.groupTemperature < snapshot.targetGroupTemperature - HEATED_MARGIN;
  const steamTarget = settings?.targetSteamTemp ?? 0;
  return steamTarget > 0 && snapshot.steamTemperature < steamTarget - HEATED_MARGIN;
}

/** The status of a page whose state line waits for `target`: 'Heating' in place of 'Idle'. */
export function heatingStatus(
  status: Status,
  link: Link,
  snapshot: MachineSnapshot | null,
  target: HeatTarget,
  settings: ShotSettings | null,
): Status {
  if (link !== 'machine' || !isHeating(snapshot, target, settings)) return status;
  return { ...status, title: 'Heating', tone: 'busy' };
}

/**
 * The stop button: whatever runs can be stopped from the skin. Nothing is started from it: the
 * DE1 is started at the machine (founder, 2026-10-13).
 */
export function canStop(link: Link, snapshot: MachineSnapshot | null): boolean {
  return link === 'machine' && snapshot !== null && RUNNING.includes(snapshot.state.state);
}

/** The sleep entry of home's menu: a machine that is awake and runs nothing can be put to sleep. */
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

/**
 * One value of the state line: 'group 92.6 °C'. `warn`: the value is a warning, the scale that
 * is not connected or a tank under its refill level.
 */
export interface StateValue {
  key: 'group' | 'steam' | 'tank' | 'scale';
  label: string;
  value: string;
  warn: boolean;
}

/**
 * The state line of home and the steam page: the machine's values only from a fresh frame
 * (principle 3), the tank's level only from its stream, the weight only from a connected scale.
 * A value that was not read is '–'. Without a scale the warning says whether the skin is looking
 * for it (`scaleLooking`, spec 3.9) or that a tap looks again.
 */
export function stateLine(
  link: Link,
  snapshot: MachineSnapshot | null,
  water: WaterLevels | null,
  scaleLink: ScaleLink,
  weight: number | null,
  scaleLooking = false,
): StateValue[] {
  const machine = link === 'machine' ? snapshot : null;
  const tank = link === 'machine' ? water : null;
  const degrees = (value: number | undefined) => (value === undefined ? '–' : `${value.toFixed(0)} °C`);
  return [
    { key: 'group', label: 'group', value: machine ? `${machine.groupTemperature.toFixed(1)} °C` : '–', warn: false },
    { key: 'steam', label: 'steam', value: degrees(machine?.steamTemperature), warn: false },
    {
      key: 'tank',
      label: 'tank',
      value: tank ? `${tank.currentLevel.toFixed(0)} mm` : '–',
      warn: tank !== null && tank.currentLevel < tank.refillLevel,
    },
    scaleLink === 'connected'
      ? { key: 'scale', label: 'scale', value: weight === null ? '–' : `${weight.toFixed(1)} g`, warn: false }
      : { key: 'scale', label: 'scale', value: scaleLooking ? 'looking for it' : 'not connected, tap to retry', warn: true },
  ];
}
