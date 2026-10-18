// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/profile_editor.js (buildStepScript, temperatureVerb, renderScriptLine).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The SCRIPT tab's sentences (spec 3.7, research.md 17.18): each step as Streamline's lines of
// words, cycling chips and value pills, in Streamline's order (marker, temperature, pump,
// limit, maximum, exit). Nothing is typed, so nothing can fail to parse: a chip is one of the
// model's cycles, a pill opens the number pad on one of the model's values (`limitOf`).
import type { Profile, ProfileStep } from '../api';
import { EXIT_CYCLE_STATES, exitCycleIndex, isOff, num, pumpLabel, readExitDef, setExit, valueOf, type StepValue } from './model';

export type Tone = 'flow' | 'pressure' | 'temperature' | 'weight' | 'none';

/** The state words a tap cycles. */
export type ScriptChip = 'sensor' | 'pump' | 'exit';

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; chip: ScriptChip; text: string; tone: Tone }
  | { kind: 'value'; value: StepValue; text: string; tone: Tone };

export interface Sentence {
  kind: 'volumeStart' | 'temperature' | 'pump' | 'limit' | 'maximum' | 'exit';
  parts: Part[];
}

/** Streamline's units; the number pad shows the model's (ml/s, s). */
const UNIT = { flow: 'mL/s', pressure: 'bar' } as const;
const MAXIMA = [
  { value: 'weight', unit: 'g', tone: 'weight' },
  { value: 'seconds', unit: 'sec', tone: 'none' },
  { value: 'volume', unit: 'ml', tone: 'none' },
] as const;

/** "Set" on the first step, then Increase, Decrease or Maintain against the step before. */
export function temperatureVerb(previous: number | null, temperature: number): 'Set' | 'Increase' | 'Decrease' | 'Maintain' {
  if (previous === null) return 'Set';
  if (temperature > previous) return 'Increase';
  if (temperature < previous) return 'Decrease';
  return 'Maintain';
}

/** One decimal, as Streamline prints it ("93.0 °C"), two where the value has them (0.75). */
export function scriptNumber(value: number): string {
  const v = Number(value.toFixed(2)) || 0;
  return v.toFixed(Math.round(v * 10) !== v * 10 ? 2 : 1);
}

const text = (words: string): Part => ({ kind: 'text', text: words });
const pill = (step: ProfileStep, value: StepValue, unit: string, tone: Tone): Part => ({
  kind: 'value',
  value,
  text: `${scriptNumber(valueOf(step, value))} ${unit}`,
  tone,
});

/**
 * The sentences of step `index`. A limit, a maximum and an exit that are off have no sentence,
 * as in Streamline: "Limit to 0.0 bar" says what the step does not do; the cards add them.
 */
export function stepSentences(profile: Profile, index: number): Sentence[] {
  const step = profile.steps[index];
  const previous = index > 0 ? profile.steps[index - 1] : null;
  const pressure = step.pump === 'pressure';
  const pump = pressure ? 'pressure' : 'flow';
  const other = pressure ? 'flow' : 'pressure';
  const sentences: Sentence[] = [];

  // `target_volume_count_start` is 1-based (0: none): the count starts on the step after it.
  const start = profile.target_volume_count_start || 0;
  if (start > 0 && start === index) sentences.push({ kind: 'volumeStart', parts: [text('Start tracking water volume')] });

  const verb = temperatureVerb(previous ? num(previous.temperature) : null, num(step.temperature));
  sentences.push({
    kind: 'temperature',
    parts: [
      text(verb),
      { kind: 'chip', chip: 'sensor', text: step.sensor === 'water' ? 'Water' : 'Coffee', tone: 'temperature' },
      text('temperature'),
      text(verb === 'Maintain' ? 'at' : 'to'),
      pill(step, 'temperature', '°C', 'temperature'),
    ],
  });

  sentences.push({
    kind: 'pump',
    parts: [
      { kind: 'chip', chip: 'pump', text: pumpLabel({ pump, transition: step.transition === 'smooth' ? 'smooth' : 'fast' }), tone: pump },
      text(pressure ? 'to' : 'at a rate of'),
      pill(step, 'target', UNIT[pump], pump),
    ],
  });

  if (!isOff(step, 'limiter')) {
    sentences.push({ kind: 'limit', parts: [text('Limit to'), pill(step, 'limiter', UNIT[other], other)] });
  }

  const maxima = MAXIMA.filter((maximum) => !isOff(step, maximum.value));
  if (maxima.length > 0) {
    const parts: Part[] = [text('For a maximum of')];
    maxima.forEach((maximum, n) => {
      if (n > 0) parts.push(text('or'));
      parts.push(pill(step, maximum.value, maximum.unit, maximum.tone));
    });
    sentences.push({ kind: 'maximum', parts });
  }

  const exit = readExitDef(step);
  if (exit.type !== 'off') {
    sentences.push({
      kind: 'exit',
      parts: [
        text('Move on if'),
        { kind: 'chip', chip: 'exit', text: `${exit.type === 'flow' ? 'Flow' : 'Pressure'} ${exit.condition === 'under' ? 'is under' : 'is over'}`, tone: exit.type },
        pill(step, 'exit', UNIT[exit.type], exit.type),
      ],
    });
  }
  return sentences;
}

/** The exits the SCRIPT chip cycles: off is left out, as it would remove the chip being tapped. */
const SCRIPT_EXITS = EXIT_CYCLE_STATES.filter((state) => state.type !== 'off');

/** The next exit of a step that has one: pressure over, pressure under, flow over, flow under, round again. */
export function cycleScriptExit(profile: Profile, index: number): Profile {
  const exit = readExitDef(profile.steps[index]);
  if (exit.type === 'off') return profile;
  const next = SCRIPT_EXITS[(exitCycleIndex(exit.type, exit.condition) + 1) % SCRIPT_EXITS.length];
  return setExit(profile, index, next);
}
