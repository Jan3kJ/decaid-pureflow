// What an edit does to the parameters, beyond writing one number. Pure: parameters in, new
// parameters out. The two ways to change a value differ only for the temperatures: detail
// mode sets one phase's temperature, a drag on the graph moves a group of phases together.
import { hasSecondFill, paramRanges, resolveParams, type AFlowParams, type FollowField, type NumberField } from '../aflow';
import { PAUSE_SECONDS } from '../aflow/constants';
import type { EditField } from './curve';

/**
 * The temperature lines a drag moves together (spec 3.2): the fill's with infuse and 2nd
 * fill, the flow's with pressurize.
 */
export const TEMPERATURE_GROUPS: Partial<Record<EditField, readonly FollowField[]>> = {
  fillTemperature: ['infuseTemperature', 'secondFillTemperature'],
  pourTemperature: ['rampTemperature'],
};

/** Which temperature follows which while it is null (resolveParams). */
const FOLLOWED_BY: Partial<Record<EditField, FollowField>> = {
  fillTemperature: 'infuseTemperature',
  infuseTemperature: 'secondFillTemperature',
  pourTemperature: 'rampTemperature',
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Detail mode: sets one value. A temperature that followed the changed one keeps the value
 * it had, so that each phase's temperature is edited by itself.
 */
export function setValue(p: AFlowParams, field: EditField, value: number): AFlowParams {
  const next: AFlowParams = { ...p, [field]: value };
  const follower = FOLLOWED_BY[field];
  if (follower && p[follower] === null) next[follower] = resolveParams(p)[follower];
  // An end flow of its own replaces the toggle: keep the toggle's text true to the curve.
  if (field === 'pourEndFlow') next.flowUp = value >= p.pourFlow;
  return next;
}

/**
 * A drag on the graph: sets one value as detail mode does, and moves a temperature group as a
 * whole. The distances detail mode set between the group's phases stay (founder, 2026-10-12),
 * so the group stops where its first line reaches the end of the range.
 */
export function dragValue(p: AFlowParams, field: EditField, value: number): AFlowParams {
  const followers = TEMPERATURE_GROUPS[field];
  if (!followers) return setValue(p, field, value);

  // A group is led by a temperature that is always a number.
  const lead = field as NumberField;
  const { min, max } = paramRanges()[lead];
  const own = followers.filter((f) => p[f] !== null);
  const values = [p[lead], ...own.map((f) => p[f] as number)];
  const delta = Math.min(max - Math.max(...values), Math.max(min - Math.min(...values), value - p[lead]));
  const next: AFlowParams = { ...p, [lead]: round1(p[lead] + delta) };
  for (const f of own) next[f] = round1((p[f] as number) + delta);
  return next;
}

/** The 2nd fill is on while the pause lasts: switching it on starts at the plugin's 15 s. */
export function toggleSecondFill(p: AFlowParams): AFlowParams {
  return { ...p, pauseDuration: hasSecondFill(p) ? 0 : PAUSE_SECONDS };
}

/** Flow up or flow down. The end flow follows the toggle again (docs/a-flow-3.0.md, 1). */
export function toggleFlow(p: AFlowParams): AFlowParams {
  return { ...p, flowUp: !p.flowUp, pourEndFlow: null };
}
