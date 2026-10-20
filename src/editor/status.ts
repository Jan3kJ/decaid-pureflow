import type { Dropped, ProfileStep } from '../aflow';

/** A line of the editor's status line (spec 3.8 T7, 3.9 item 8). */
export interface Notice {
  tone: 'info' | 'warn';
  text: string;
}

/** how long a result stands in the status line */
export const NOTICE_MS = 4000;

/**
 * How long a notice stands, in milliseconds: a result goes after 4 s, a failure stays until
 * the next action (spec 3.8, T7).
 */
export function noticeLasts(notice: Notice): number | null {
  return notice.tone === 'info' ? NOTICE_MS : null;
}

/** 'save' on a default: a default is saved under a new name (founder, 2026-10-17). */
export const DEFAULT_SAVE_HINT = 'A default is not changed: use ‘save as’ to save it under a new name.';

const DROPPED_TEXT: Record<Dropped, string> = {
  preFill: 'Pre Fill',
  rampDown: 'ramp down',
  pause: 'the Pause without a 2nd fill',
  infuseVolume: 'the infuse volume',
};

/**
 * The line an older A-Flow profile opens with (spec 3.9, U2): that 'save' stores it as 3.0,
 * and what reading its steps dropped. Pre Fill is not named while the setting 'first-step
 * workaround' writes it again. A drop stays until the next action, as a failure does.
 */
export function convertedNotice(dropped: readonly Dropped[], firstStepWorkaround: boolean): Notice {
  const named = dropped.filter((entry) => !(entry === 'preFill' && firstStepWorkaround)).map((entry) => DROPPED_TEXT[entry]);
  const save = '‘save’ stores it as A-Flow 3.0';
  if (named.length === 0) return { tone: 'info', text: `An older A-Flow profile: ${save}.` };
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`;
  return { tone: 'warn', text: `An older A-Flow profile, read without ${list}, which 3.0 has not got; ${save}.` };
}

/**
 * The exit column of the profile steps: a step's exit condition and weight, and on the last
 * step, the flow step that runs until the shot ends, the stop weight (founder, 2026-10-17).
 */
export function exitText(step: ProfileStep, stopWeight: number | null): string {
  const parts: string[] = [];
  if (step.exit) {
    const unit = step.exit.type === 'flow' ? 'ml/s' : 'bar';
    parts.push(`${step.exit.type} ${step.exit.condition} ${step.exit.value} ${unit}`);
  }
  if (step.weight > 0) parts.push(`weight ${step.weight} g`);
  if (stopWeight !== null) parts.push(`stops at ${stopWeight} g`);
  return parts.join(', ') || '-';
}
