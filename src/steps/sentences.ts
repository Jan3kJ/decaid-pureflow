// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/profile_editor.js (buildStepScript, temperatureVerb, renderScriptLine).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The SCRIPT tab's sentences: each step as Streamline's lines of
// words, cycling chips and value pills, in Streamline's order (marker, temperature, pump,
// limit, maximum, exit). Nothing is typed, so nothing can fail to parse: a chip is one of the
// model's cycles, a pill opens the number pad on one of the model's values (`limitOf`).
//
// Unlike Streamline, a limit, maximum or exit that is off keeps its line, muted ('No limit',
// 'No maximum', 'Move on: off'), so it can be switched on here as on the cards, and the exit
// chip cycles to off without its line going away under the finger.
import type { Profile, ProfileStep } from '../api';
import { isOff, num, pumpLabel, readExitDef, valueOf, type StepValue } from './model';

export type Tone = 'flow' | 'pressure' | 'temperature' | 'weight' | 'none';

/** The state words a tap cycles; `limit` switches a limit that is off on. */
export type ScriptChip = 'sensor' | 'pump' | 'exit' | 'limit';

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; chip: ScriptChip; text: string; tone: Tone }
  /** `off`: a maximum's amount that is off, shown muted */
  | { kind: 'value'; value: StepValue; text: string; tone: Tone; off?: boolean };

export interface Sentence {
  kind: 'volumeStart' | 'temperature' | 'pump' | 'limit' | 'maximum' | 'exit';
  parts: Part[];
  /** a limit, maximum or exit that is off: the line is muted */
  off?: boolean;
}

/** Streamline's units; the number pad shows the model's (ml/s, s). */
const UNIT = { flow: 'mL/s', pressure: 'bar' } as const;
const MAXIMA = [
  { value: 'weight', unit: 'g', tone: 'weight', name: 'weight' },
  { value: 'seconds', unit: 'sec', tone: 'none', name: 'time' },
  { value: 'volume', unit: 'ml', tone: 'none', name: 'volume' },
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
 * The sentences of step `index`. A limit, a maximum and an exit that are off keep their line,
 * muted, with the chip or pills that switch them on; a maximum's amount that is off is a muted
 * pill in its place.
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
      {
        kind: 'chip',
        chip: 'pump',
        text: pumpLabel({ pump, transition: step.transition === 'smooth' ? 'smooth' : 'fast' }),
        tone: pump,
      },
      text(pressure ? 'to' : 'at a rate of'),
      pill(step, 'target', UNIT[pump], pump),
    ],
  });

  if (isOff(step, 'limiter')) {
    sentences.push({
      kind: 'limit',
      off: true,
      parts: [text('No limit'), { kind: 'chip', chip: 'limit', text: 'switch on', tone: 'none' }],
    });
  } else {
    sentences.push({ kind: 'limit', parts: [text('Limit to'), pill(step, 'limiter', UNIT[other], other)] });
  }

  const allOff = MAXIMA.every((maximum) => isOff(step, maximum.value));
  const maximumParts: Part[] = [text(allOff ? 'No maximum' : 'For a maximum of')];
  MAXIMA.forEach((maximum, n) => {
    if (n > 0) maximumParts.push(text('or'));
    maximumParts.push(
      isOff(step, maximum.value)
        ? { kind: 'value', value: maximum.value, text: `${maximum.name} off`, tone: 'none', off: true }
        : pill(step, maximum.value, maximum.unit, maximum.tone),
    );
  });
  sentences.push({ kind: 'maximum', parts: maximumParts, ...(allOff ? { off: true } : {}) });

  const exit = readExitDef(step);
  if (exit.type === 'off') {
    sentences.push({
      kind: 'exit',
      off: true,
      parts: [text('Move on:'), { kind: 'chip', chip: 'exit', text: 'off', tone: 'none' }],
    });
  } else {
    sentences.push({
      kind: 'exit',
      parts: [
        text('Move on if'),
        {
          kind: 'chip',
          chip: 'exit',
          text: `${exit.type === 'flow' ? 'Flow' : 'Pressure'} ${exit.condition === 'under' ? 'is under' : 'is over'}`,
          tone: exit.type,
        },
        pill(step, 'exit', UNIT[exit.type], exit.type),
      ],
    });
  }
  return sentences;
}
