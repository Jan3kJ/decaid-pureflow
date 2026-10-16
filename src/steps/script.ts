// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/profile_editor.js (`buildStepScript`, `temperatureVerb`, `scriptValueFormat`,
// `renderScriptLine`: the wording of the SCRIPT tab).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The SCRIPT tab as data (research.md 17.8): `writeScript` prints a profile's steps in
// Streamline's sentences, `parseScript` reads such a text back into the profile. Streamline's
// own tab has no text to type, so the parser is the skin's own. Pure: no DOM and no Svelte.
//
// Nothing is lost: a parsed step whose sentences say what a step of the profile says is that
// step, unchanged; a step whose sentences differ is the profile's step at its place with only
// the changed values set (as a card edit does), so the fields the text does not hold (the
// unused pump's value, a limiter's range, a limiter of 0, fields of other apps) stay. Every
// top-level field but the start of the volume count comes from the profile.
import type { Profile, ProfileStep, StepExit } from '../api';
import { EXIT_MAX_MAP, FIELD_LIMITS, type Limit } from './limits';
import { newLimiterRange, num, readExitDef } from './model';

/** A step as its sentences say it: every number rounded as it is printed. */
interface StepView {
  name: string;
  sensor: 'coffee' | 'water';
  temperature: number;
  pump: 'flow' | 'pressure';
  transition: 'fast' | 'smooth';
  target: number;
  /** 0: no limit */
  limit: number;
  weight: number;
  seconds: number;
  volume: number;
  exit: { type: 'pressure' | 'flow'; condition: 'over' | 'under'; value: number } | null;
}

/** Two decimals at most, without a float's noise (-4e-16 bar reads 0). */
const round = (value: unknown) => Number(num(value).toFixed(2)) || 0;

function viewOf(step: ProfileStep): StepView {
  const pump = step.pump === 'pressure' ? 'pressure' : 'flow';
  const exit = readExitDef(step);
  return {
    name: String(step.name ?? '').trim(),
    sensor: step.sensor === 'water' ? 'water' : 'coffee',
    temperature: round(step.temperature),
    pump,
    transition: step.transition === 'smooth' ? 'smooth' : 'fast',
    target: round(pump === 'pressure' ? step.pressure : step.flow),
    limit: step.limiter ? round(step.limiter.value) : 0,
    weight: round(step.weight),
    seconds: round(step.seconds),
    volume: round(step.volume),
    exit: exit.type === 'off' ? null : { type: exit.type, condition: exit.condition, value: round(exit.value) },
  };
}

const sameExit = (a: StepView['exit'], b: StepView['exit']) =>
  a === b || (!!a && !!b && a.type === b.type && a.condition === b.condition && a.value === b.value);

function sameView(a: StepView, b: StepView): boolean {
  return (
    a.name === b.name &&
    a.sensor === b.sensor &&
    a.temperature === b.temperature &&
    a.pump === b.pump &&
    a.transition === b.transition &&
    a.target === b.target &&
    a.limit === b.limit &&
    a.weight === b.weight &&
    a.seconds === b.seconds &&
    a.volume === b.volume &&
    sameExit(a.exit, b.exit)
  );
}

// --- the writer ---

/** One decimal, as Streamline's `scriptValueFormat`; two where the value has a second (0.75). */
export function scriptNumber(value: unknown): string {
  const v = round(value);
  return v.toFixed(Math.round(v * 10) === v * 10 ? 1 : 2);
}

/** Streamline's `temperatureVerb`: Set on the first step, then against the step before. */
function temperatureVerb(previous: number | null, temperature: number): string {
  if (previous === null) return 'Set';
  if (temperature > previous) return 'Increase';
  if (temperature < previous) return 'Decrease';
  return 'Maintain';
}

const PUMP_UNIT = { flow: 'mL/s', pressure: 'bar' } as const;
/** a flow step is limited in bar, a pressure step in mL/s */
const LIMIT_UNIT = { flow: 'bar', pressure: 'mL/s' } as const;

function stepLines(view: StepView, index: number, previous: StepView | null, countStart: number): string[] {
  const lines = [`${index + 1}: ${view.name}`.trimEnd()];
  if (countStart > 0 && countStart === index) lines.push('- Start tracking water volume');
  const verb = temperatureVerb(previous?.temperature ?? null, view.temperature);
  lines.push(`- ${verb} ${view.sensor} temperature ${verb === 'Maintain' ? 'at' : 'to'} ${scriptNumber(view.temperature)} °C`);
  const pump = view.pump === 'pressure' ? 'Pressure' : 'Flow';
  const how = view.transition === 'smooth' ? 'slowly' : 'quickly';
  const rate = view.pump === 'pressure' ? 'to' : 'at a rate of';
  lines.push(`- ${pump} ${how} ${rate} ${scriptNumber(view.target)} ${PUMP_UNIT[view.pump]}`);
  if (view.limit > 0) lines.push(`- Limit to ${scriptNumber(view.limit)} ${LIMIT_UNIT[view.pump]}`);
  const amounts = [
    view.weight > 0 ? `${scriptNumber(view.weight)} g` : null,
    view.seconds > 0 ? `${scriptNumber(view.seconds)} sec` : null,
    view.volume > 0 ? `${scriptNumber(view.volume)} ml` : null,
  ].filter((amount) => amount !== null);
  if (amounts.length > 0) lines.push(`- For a maximum of ${amounts.join(' or ')}`);
  // As Streamline: an exit of 0 is printed too, since "pressure is over 0 bar" ends the step at once.
  if (view.exit) {
    const exit = view.exit;
    lines.push(`- Move on if ${exit.type} is ${exit.condition} ${scriptNumber(exit.value)} ${PUMP_UNIT[exit.type]}`);
  }
  return lines;
}

/** The profile's steps as text, in Streamline's sentences and order. */
export function writeScript(profile: Profile): string {
  const countStart = num(profile.target_volume_count_start);
  const views = profile.steps.map(viewOf);
  return views.flatMap((view, index) => stepLines(view, index, views[index - 1] ?? null, countStart)).join('\n');
}

// --- the parser ---

export type ScriptResult = { ok: true; profile: Profile } | { ok: false; errors: string[] };

const NUM = '(-?\\d+(?:\\.\\d+)?|-?\\.\\d+)';
const RATE_UNIT = '(ml/s|bar)';
const MARKER = /^start\s+tracking\s+water\s+volume$/i;
const TEMPERATURE = new RegExp(`^(set|maintain|increase|decrease)\\s+(coffee|water)\\s+temperature\\s+(?:to|at)\\s+${NUM}\\s*°?\\s*c$`, 'i');
const PUMP = new RegExp(`^(flow|pressure)\\s+(quickly|slowly)\\s+(?:at\\s+a\\s+rate\\s+of|to)\\s+${NUM}\\s*${RATE_UNIT}$`, 'i');
const LIMIT = new RegExp(`^limit\\s+to\\s+${NUM}\\s*${RATE_UNIT}$`, 'i');
const MAXIMUM = /^for\s+a\s+maximum\s+of\s+(.+)$/i;
const AMOUNT = new RegExp(`^${NUM}\\s*(g|sec|s|ml)$`, 'i');
const EXIT = new RegExp(`^move\\s+on\\s+if\\s+(pressure|flow)\\s+is\\s+(over|under)\\s+${NUM}\\s*${RATE_UNIT}$`, 'i');
const HEADER = /^(\d+)\s*:(.*)$/;

type Kind = 'temperature' | 'pump' | 'limit' | 'maximum' | 'exit';

interface Draft {
  line: number;
  name: string;
  sentences: Partial<Record<Kind, number>>;
  sensor?: 'coffee' | 'water';
  temperature?: number;
  pump?: 'flow' | 'pressure';
  transition?: 'fast' | 'smooth';
  target?: number;
  targetUnit?: string;
  limit?: number;
  limitUnit?: string;
  weight: number;
  seconds: number;
  volume: number;
  exit: StepView['exit'];
  exitUnit?: string;
}

const unitOf = (typed: string) => (typed.toLowerCase() === 'bar' ? 'bar' : 'mL/s');

/**
 * The steps of a text (research.md 17.8), on the profile: a text that parses gives the profile
 * with these steps and this start of the volume count; one that does not gives every error,
 * with its line where it has one.
 */
export function parseScript(text: string, profile: Profile): ScriptResult {
  const errors: string[] = [];
  const drafts: Draft[] = [];
  let marker: { line: number; step: number } | null = null;

  text.split(/\r?\n/).forEach((raw, at) => {
    const line = at + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const header = HEADER.exec(trimmed);
    if (header) {
      drafts.push({ line, name: header[2].trim(), sentences: {}, weight: 0, seconds: 0, volume: 0, exit: null });
      return;
    }
    const draft = drafts.at(-1);
    if (!draft) {
      errors.push(`line ${line}: a step starts with 'number: name'`);
      return;
    }
    const sentence = trimmed.replace(/^[-•]\s*/, '').replace(/\s+/g, ' ');
    const stepNumber = drafts.length;
    const once = (kind: Kind): boolean => {
      if (draft.sentences[kind] !== undefined) {
        errors.push(`line ${line}: step ${stepNumber} has a second ${kind} sentence`);
        return false;
      }
      draft.sentences[kind] = line;
      return true;
    };
    let match: RegExpExecArray | null;
    if (MARKER.test(sentence)) {
      if (marker) errors.push(`line ${line}: the water volume is tracked from one step only`);
      else if (stepNumber === 1) errors.push(`line ${line}: tracking the water volume cannot start on step 1`);
      else marker = { line, step: stepNumber };
    } else if ((match = TEMPERATURE.exec(sentence))) {
      if (once('temperature')) {
        draft.sensor = match[2].toLowerCase() as 'coffee' | 'water';
        draft.temperature = Number(match[3]);
      }
    } else if ((match = PUMP.exec(sentence))) {
      if (once('pump')) {
        draft.pump = match[1].toLowerCase() as 'flow' | 'pressure';
        draft.transition = match[2].toLowerCase() === 'slowly' ? 'smooth' : 'fast';
        draft.target = Number(match[3]);
        draft.targetUnit = unitOf(match[4]);
      }
    } else if ((match = LIMIT.exec(sentence))) {
      if (once('limit')) {
        draft.limit = Number(match[1]);
        draft.limitUnit = unitOf(match[2]);
      }
    } else if ((match = MAXIMUM.exec(sentence))) {
      if (once('maximum')) {
        const seen = new Set<string>();
        for (const part of match[1].split(/\s+or\s+/i)) {
          const amount = AMOUNT.exec(part.trim());
          if (!amount) {
            errors.push(`line ${line}: not understood: '${part.trim()}' (an amount is a number with g, sec or ml)`);
            continue;
          }
          const unit = amount[2].toLowerCase();
          const field = unit === 'g' ? 'weight' : unit === 'ml' ? 'volume' : 'seconds';
          if (seen.has(field)) errors.push(`line ${line}: a maximum names the ${field} once`);
          seen.add(field);
          draft[field] = Number(amount[1]);
        }
      }
    } else if ((match = EXIT.exec(sentence))) {
      if (once('exit')) {
        const type = match[1].toLowerCase() as 'pressure' | 'flow';
        draft.exit = { type, condition: match[2].toLowerCase() as 'over' | 'under', value: Number(match[3]) };
        draft.exitUnit = unitOf(match[4]);
      }
    } else {
      errors.push(`line ${line}: not understood: '${trimmed}'`);
    }
  });

  if (drafts.length === 0 && errors.length === 0) errors.push('the script has no step');

  const views: StepView[] = [];
  drafts.forEach((draft, index) => {
    const n = index + 1;
    if (draft.sentences.temperature === undefined) errors.push(`step ${n} has no temperature sentence`);
    if (draft.sentences.pump === undefined) errors.push(`step ${n} has no pump sentence`);
    if (draft.sentences.temperature === undefined || draft.sentences.pump === undefined) return;
    const pump = draft.pump!;
    const view: StepView = {
      name: draft.name,
      sensor: draft.sensor!,
      temperature: round(draft.temperature),
      pump,
      transition: draft.transition!,
      target: round(draft.target),
      limit: round(draft.limit ?? 0),
      weight: round(draft.weight),
      seconds: round(draft.seconds),
      volume: round(draft.volume),
      exit: draft.exit ? { ...draft.exit, value: round(draft.exit.value) } : null,
    };
    // Units follow the pump (rule 2).
    if (draft.targetUnit !== PUMP_UNIT[pump]) errors.push(`line ${draft.sentences.pump}: a ${pump} target is in ${PUMP_UNIT[pump]}`);
    if (draft.limitUnit && draft.limitUnit !== LIMIT_UNIT[pump]) {
      errors.push(`line ${draft.sentences.limit}: a ${pump} step is limited in ${LIMIT_UNIT[pump]}`);
    }
    if (view.exit && draft.exitUnit !== PUMP_UNIT[view.exit.type]) {
      errors.push(`line ${draft.sentences.exit}: an exit on ${view.exit.type} is in ${PUMP_UNIT[view.exit.type]}`);
    }
    // Ranges (rule 3); a value the profile's step at this place already has is kept, as on a card.
    const own = profile.steps[index] ? viewOf(profile.steps[index]) : null;
    const check = (value: number, ownValue: number | undefined, limit: Limit, what: string, unit: string, line?: number) => {
      if (value >= limit.min && value <= limit.max) return;
      if (ownValue !== undefined && value === ownValue) return;
      errors.push(`line ${line ?? draft.line}: ${what} is ${limit.min} to ${limit.max} ${unit}`);
    };
    const t = draft.sentences;
    check(view.temperature, own?.temperature, FIELD_LIMITS.temperature, 'temperature', '°C', t.temperature);
    check(view.target, own?.pump === pump ? own.target : undefined, FIELD_LIMITS[pump], pump, PUMP_UNIT[pump], t.pump);
    const limitLimit = pump === 'pressure' ? FIELD_LIMITS.flowLimit : FIELD_LIMITS.pressureLimit;
    check(view.limit, own?.pump === pump ? own.limit : undefined, limitLimit, `a ${pump === 'pressure' ? 'flow' : 'pressure'} limit`, LIMIT_UNIT[pump], t.limit);
    check(view.weight, own?.weight, FIELD_LIMITS.weight, 'weight', 'g', t.maximum);
    check(view.seconds, own?.seconds, FIELD_LIMITS.seconds, 'time', 'sec', t.maximum);
    check(view.volume, own?.volume, FIELD_LIMITS.volume, 'volume', 'ml', t.maximum);
    if (view.exit) {
      const exitLimit = { min: 0, max: EXIT_MAX_MAP[view.exit.type], step: 0.1, unit: PUMP_UNIT[view.exit.type] };
      const ownExit = own?.exit?.type === view.exit.type ? own.exit.value : undefined;
      check(view.exit.value, ownExit, exitLimit, `an exit on ${view.exit.type}`, PUMP_UNIT[view.exit.type], t.exit);
    }
    views.push(view);
  });

  if (errors.length > 0) return { ok: false, errors };

  // A step the text says unchanged is the profile's step itself, at its place first.
  const used = new Set<ProfileStep>();
  const steps = views.map((view, index) => {
    const here = profile.steps[index];
    const same =
      here && !used.has(here) && sameView(viewOf(here), view)
        ? here
        : profile.steps.find((step) => !used.has(step) && sameView(viewOf(step), view));
    if (same) {
      used.add(same);
      return same;
    }
    return applyView(here, view, profile);
  });

  const countStart = marker ? (marker as { step: number }).step - 1 : 0;
  const next: Profile = { ...profile, steps };
  if (countStart !== num(profile.target_volume_count_start)) next.target_volume_count_start = countStart;
  return { ok: true, profile: next };
}

/** The profile's step at this place with what the text changed set, or a new step where there is none. */
function applyView(base: ProfileStep | undefined, view: StepView, profile: Profile): ProfileStep {
  if (!base) {
    return {
      name: view.name,
      temperature: view.temperature,
      sensor: view.sensor,
      pump: view.pump,
      transition: view.transition,
      ...(view.pump === 'pressure' ? { pressure: view.target } : { flow: view.target }),
      seconds: view.seconds,
      volume: view.volume,
      weight: view.weight,
      exit: view.exit ? { ...view.exit } : null,
      limiter: view.limit > 0 ? { value: view.limit, range: newLimiterRange(profile, view.pump) } : null,
    };
  }
  const was = viewOf(base);
  const next: ProfileStep = { ...base };
  if (view.name !== was.name) next.name = view.name;
  if (view.sensor !== was.sensor) next.sensor = view.sensor;
  if (view.temperature !== was.temperature) next.temperature = view.temperature;
  if (view.pump !== was.pump || view.transition !== was.transition) {
    next.pump = view.pump;
    next.transition = view.transition;
  }
  if (view.pump !== was.pump || view.target !== was.target) {
    if (view.pump === 'pressure') next.pressure = view.target;
    else next.flow = view.target;
  }
  if (view.pump !== was.pump || view.limit !== was.limit) {
    if (view.limit > 0) {
      const range = base.limiter && view.pump === was.pump ? base.limiter.range : newLimiterRange(profile, view.pump);
      next.limiter = { ...(base.limiter ?? {}), value: view.limit, range };
    } else if (was.limit > 0) {
      next.limiter = null;
    }
  }
  for (const field of ['weight', 'seconds', 'volume'] as const) {
    if (view[field] !== was[field]) next[field] = view[field];
  }
  if (!sameExit(view.exit, was.exit)) {
    next.exit = view.exit ? ({ ...(base.exit ?? {}), ...view.exit } as StepExit) : null;
  }
  return next;
}
