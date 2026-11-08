// What the header shows besides the readings: the top left corner and the light behind the row.
import type { MachineState } from '../api';
import { HEATER_OFF, stateLabel, type Link, type Status } from './machine';

/**
 * The top left corner: empty while all is ordinary; the dim word of a machine that sleeps or a
 * steam heater that is off (no action); a fault in warning orange, whose tap opens its details.
 * Every other state is no word: the light says something runs.
 */
export type Corner =
  { kind: 'none' } | { kind: 'word'; word: string } | { kind: 'fault'; title: string; detail: string; reconnect: boolean };

export function cornerOf(link: Link, status: Status): Corner {
  if (status.tone === 'warn') return { kind: 'fault', title: status.title, detail: status.detail, reconnect: link === 'refused' };
  if (status.title === stateLabel('sleeping') || status.title === HEATER_OFF) return { kind: 'word', word: status.title };
  return { kind: 'none' };
}

/** The faint light behind the header row. */
export type Light = 'none' | 'heating' | 'flow' | 'steam' | 'fault';

const FLOWING: readonly string[] = ['espresso', 'hotWater', 'flush', 'steamRinse'] satisfies MachineState[];

/**
 * A fault is a steady orange light; a heating heater breathes red; steam running is a steady
 * red, water or a shot a steady blue; an idle machine has no light. `state` is the machine's
 * state, null without a machine.
 */
export function lightOf(link: Link, status: Status, state: string | null): Light {
  if (status.tone === 'warn') return 'fault';
  if (link !== 'machine') return 'none';
  if (status.title === stateLabel('heating')) return 'heating';
  if (state === 'steam') return 'steam';
  if (state !== null && FLOWING.includes(state)) return 'flow';
  return 'none';
}
