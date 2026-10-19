// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/shotData.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The shot's values per phase, as Streamline's shot data table shows them (spec 3.9, the
// founder's screenshot of 2026-10-17): rows Preinfusion, Extraction and Total; columns the
// seconds, the weight, the volume, the temperature (lowest → highest), the flow and the
// pressure (start → peak → end). Pure: frames in, the table's cells out (research.md 24).
import type { MachineSnapshot, ShotRecord } from '../api';

/** One machine frame of the shot as the table counts it. */
export interface PhaseSample {
  /** ms, the frame's timestamp */
  at: number;
  /** the frame is in `pouring`: the first one ends the preinfusion */
  pouring: boolean;
  /** bar */
  pressure: number;
  /** ml/s */
  flow: number;
  /** °C at the group, as the graph draws it */
  temperature: number;
  /** g, the scale's latest weight; null without one */
  weight: number | null;
}

/** The cells of a phase's row, written as Streamline writes them. */
export interface PhaseRow {
  /** whole seconds */
  seconds: string;
  /** '34.3g', '–' without a scale */
  weight: string;
  /** whole ml, from the flow */
  volume: string;
  /** °C, lowest → highest */
  temperature: string;
  /** ml/s, start → peak → end */
  flow: string;
  /** bar, start → peak → end */
  pressure: string;
}

export interface PhaseTable {
  preinfusion: PhaseRow;
  /** null while the shot has not reached `pouring` */
  extraction: PhaseRow | null;
  total: Pick<PhaseRow, 'seconds' | 'weight' | 'volume'>;
}

/**
 * The substates Streamline counts (`espressoStates` in shotData.js): water flows through the
 * puck. `preparingForShot` before and between steps (research.md 8.2) and `pouringDone` after
 * the stop are left out.
 */
const COUNTED: readonly string[] = ['preinfusion', 'pouring'];

const ARROW = '→';

/** The frame as a sample, null for a frame the table does not count. */
export function phaseSample(frame: MachineSnapshot, weight: number | null): PhaseSample | null {
  if (frame.state.state !== 'espresso' || !COUNTED.includes(frame.state.substate)) return null;
  return {
    at: new Date(frame.timestamp).getTime(),
    pouring: frame.state.substate === 'pouring',
    pressure: frame.pressure,
    flow: frame.flow,
    temperature: frame.groupTemperature,
    weight,
  };
}

/**
 * A recorded shot's samples and its weight in the cup: Decaid's `actualYield`, else the last
 * weight of the record, also one after the counted frames (Streamline's `renderPastShot`).
 */
export function recordSamples(record: Pick<ShotRecord, 'measurements' | 'annotations'>): {
  samples: PhaseSample[];
  finalWeight: number | null;
} {
  const samples: PhaseSample[] = [];
  for (const { machine, scale } of record.measurements) {
    const sample = machine && phaseSample(machine, typeof scale?.weight === 'number' ? scale.weight : null);
    if (sample) samples.push(sample);
  }
  let finalWeight = record.annotations?.actualYield ?? null;
  for (let i = record.measurements.length - 1; finalWeight === null && i >= 0; i -= 1) {
    const weight = record.measurements[i].scale?.weight;
    if (typeof weight === 'number') finalWeight = weight;
  }
  return { samples, finalWeight };
}

/** lowest → highest, one value when they are equal (`formatRange`) */
export function formatRange(values: number[], digits: number): string {
  if (values.length === 0) return '–';
  const min = Math.min(...values).toFixed(digits);
  const max = Math.max(...values).toFixed(digits);
  return min === max ? min : `${min}${ARROW}${max}`;
}

/** start → peak → end; the peak only when it is neither (`formatStartPeakEnd`) */
export function formatStartPeakEnd(values: number[], digits: number): string {
  if (values.length === 0) return '–';
  const start = values[0].toFixed(digits);
  const end = values[values.length - 1].toFixed(digits);
  const peak = Math.max(...values).toFixed(digits);
  if (start === end) return start;
  if (peak === start || peak === end) return `${start}${ARROW}${end}`;
  return `${start}${ARROW}${peak}${ARROW}${end}`;
}

const grams = (weight: number | null | undefined) => (typeof weight === 'number' ? `${weight.toFixed(1)}g` : '–');

/**
 * The table of a shot (`calculateAndRender`). The preinfusion ends with the sample before the
 * first in `pouring`; the extraction is every sample after it. The volume is the flow summed
 * over the samples (each sample's flow until the next). The total weight is `finalWeight`, the
 * weight in the cup after the shot, else the last sample's; the extraction's weight is that
 * minus the preinfusion's, so that the two add up to the total. Null without a sample.
 */
export function phaseTable(samples: PhaseSample[], finalWeight: number | null = null): PhaseTable | null {
  if (samples.length === 0) return null;
  const last = samples.length - 1;
  // As Streamline: a first sample in pouring does not end the preinfusion, the next one does.
  const firstPouring = samples.findIndex((sample, i) => i > 0 && sample.pouring);
  const piEnd = firstPouring > 0 ? firstPouring - 1 : last;
  const exStart = firstPouring > 0 ? firstPouring : -1;

  const volumes: number[] = [0];
  for (let i = 1; i <= last; i += 1) {
    volumes.push(volumes[i - 1] + (samples[i - 1].flow * (samples[i].at - samples[i - 1].at)) / 1000);
  }
  const seconds = (from: number, to: number) => `${Math.round((samples[to].at - samples[from].at) / 1000)}`;
  const row = (from: number, to: number): Omit<PhaseRow, 'seconds' | 'weight' | 'volume'> => {
    const part = samples.slice(from, to + 1);
    return {
      temperature: formatRange(part.map((s) => s.temperature), 0),
      flow: formatStartPeakEnd(part.map((s) => s.flow), 1),
      pressure: formatStartPeakEnd(part.map((s) => s.pressure), 1),
    };
  };

  const piWeight = samples[piEnd].weight;
  const total = finalWeight ?? samples[last].weight;
  const extraction =
    exStart > 0 && samples[last].at - samples[exStart].at > 0
      ? {
          seconds: seconds(exStart, last),
          weight: grams(total !== null && piWeight !== null ? total - piWeight : null),
          volume: (volumes[last] - volumes[piEnd]).toFixed(0),
          ...row(exStart, last),
        }
      : null;
  return {
    preinfusion: {
      seconds: seconds(0, piEnd),
      weight: grams(piWeight),
      volume: volumes[piEnd].toFixed(0),
      ...row(0, piEnd),
    },
    extraction,
    total: { seconds: seconds(0, last), weight: grams(total), volume: volumes[last].toFixed(0) },
  };
}
