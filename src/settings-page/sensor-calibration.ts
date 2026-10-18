// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/sensor-cal.js and src/settings/settings.js (renderSensorCalSettings).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// Calibration > Sensor Calibration (research.md 20.3, 20.10 S2c), without UI. A write is a
// correction, not a value: the machine multiplies its flow or pressure ratio by
// measured / reported and adds measured - reported to its temperature offset, so the same pair
// written twice corrects twice. The page shows the outcome before it writes and drops the pair
// after a write.
import type { MachineSnapshot, SensorTarget } from '../api';

/** How a correction folds in: a ratio multiplies (flow, pressure), an offset adds (temperature). */
export type CalibrationKind = 'ratio' | 'offset';

export interface Sensor {
  id: SensorTarget;
  label: string;
  kind: CalibrationKind;
  unit: string;
  /** the snapshot's reading of the sensor itself, not the frame's target (a limiter in a frame that controls the other value) */
  reading: 'mixTemperature' | 'groupTemperature' | 'pressure' | 'flow';
}

/** Streamline's order. */
export const SENSORS: Sensor[] = [
  { id: 'temperature', label: 'Temperature', kind: 'offset', unit: '°C', reading: 'groupTemperature' },
  { id: 'pressure', label: 'Pressure', kind: 'ratio', unit: 'bar', reading: 'pressure' },
  { id: 'flow', label: 'Flow', kind: 'ratio', unit: 'ml/s', reading: 'flow' },
];

/** Both values go to the machine as signed Q16.16; Decaid refuses anything outside. */
export const CALIBRATION_MIN = -32768;
export const CALIBRATION_MAX = 32767.9999;

/** A capture averages the readings of this window, not one frame of the pump's cycle. */
export const SAMPLE_WINDOW_MS = 5000;

/** A ratio out by a third is a broken sensor or a wrong capture, not a calibration. */
export const RATIO_MIN = 0.75;
export const RATIO_MAX = 1.33;

/** The sensor's own reading in a frame; null without a frame. */
export function reading(sensor: Sensor, snapshot: MachineSnapshot | null): number | null {
  const value = snapshot?.[sensor.reading];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface Sample {
  value: number;
  at: number;
}

/** The mean of the samples inside the window up to `now`; null with none. */
export function average(samples: Sample[], now: number, windowMs = SAMPLE_WINDOW_MS): number | null {
  const fresh = samples.filter((sample) => Number.isFinite(sample.value) && now - sample.at <= windowMs);
  return fresh.length ? fresh.reduce((sum, sample) => sum + sample.value, 0) / fresh.length : null;
}

/** What the stored calibration becomes with this correction: the firmware's arithmetic. */
export function preview(kind: CalibrationKind, current: number, reported: number, measured: number): number | null {
  if (![current, reported, measured].every(Number.isFinite)) return null;
  if (kind === 'offset') return current + (measured - reported);
  return reported === 0 ? null : current * (measured / reported);
}

/**
 * Why this correction cannot be sent, or '' when it can: an idle machine reads 0, a measured 0
 * leaves a ratio nothing can correct from, and a ratio outside 0.75-1.33 is refused.
 */
export function blocked(kind: CalibrationKind, reported: number, measured: number): string {
  if (reported === 0) return 'The machine was not running when this was captured; capture again while it runs.';
  if (kind !== 'ratio') return '';
  if (measured === 0) return 'A measured zero cannot be calibrated.';
  const ratio = measured / reported;
  if (ratio < RATIO_MIN || ratio > RATIO_MAX) {
    return `That is ${ratio.toFixed(2)} times what the machine read; check the capture and the measurement.`;
  }
  return '';
}

/** A value typed on the pad, or null outside what Decaid takes. */
export function measuredOf(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= CALIBRATION_MIN && value <= CALIBRATION_MAX ? value : null;
}

/**
 * The correction that lands on an absolute value: with the stored C, write { C, wanted }. Both
 * kinds land on `wanted` exactly, and writing it twice changes nothing; Restore uses it.
 */
export function absolute(current: number, wanted: number): { reported: number; measured: number } {
  return { reported: current, measured: wanted };
}

/** A ratio with four places; an offset with a sign and °C. */
export function calibrationText(kind: CalibrationKind, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '–';
  if (kind === 'offset') return `${value >= 0 ? '+' : ''}${value.toFixed(2)} °C`;
  return value.toFixed(4);
}

export function readingText(sensor: Sensor, value: number | null): string {
  if (value === null) return '–';
  return `${value.toFixed(sensor.kind === 'offset' ? 1 : 2)} ${sensor.unit}`;
}

/**
 * The calibration before the last write made from this page, by sensor: what Restore puts back.
 * Only this page's writes are known to it (Streamline keeps it in its IndexedDB); here it is in
 * `localStorage`, not a setting and not backed up, as the page's location.
 */
export const PREVIOUS_KEY = 'decaid-skin.sensor-calibration-previous';

export function loadPrevious(store: Pick<Storage, 'getItem'> = localStorage): Partial<Record<SensorTarget, number>> {
  try {
    const parsed = JSON.parse(store.getItem(PREVIOUS_KEY) ?? '{}');
    return Object.fromEntries(
      SENSORS.filter((sensor) => Number.isFinite(parsed?.[sensor.id])).map((sensor) => [sensor.id, parsed[sensor.id]]),
    );
  } catch {
    return {};
  }
}

export function savePrevious(previous: Partial<Record<SensorTarget, number>>, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(PREVIOUS_KEY, JSON.stringify(previous));
  } catch {
    // without storage Restore lasts until the page is left
  }
}
