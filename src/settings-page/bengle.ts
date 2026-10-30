// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
// src/modules/machine.js (isBengleModel), src/modules/cup-warmer.js and src/settings/settings.js
// (renderCupWarmerSettings, renderLedSettings, the load-cell wizard, submitFeedback).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The Bengle pages, the manual and the feedback form, without UI: what shows
// the pages, the clamps and the colour conversion, and the wording of the calibration.
import type { FeedbackRequest, ScaleCalibrationState } from '../api';

/** True when the machine model identifies a Bengle: the Bengle pages show only then. */
export function isBengle(model: string | null | undefined): boolean {
  return String(model ?? '')
    .toLowerCase()
    .includes('bengle');
}

export const CUP_WARMER_MAX = 80;
export const CUP_WARMER_DEFAULT = 60;
export const PREHEAT_LEAD_MAX = 120;

/** A whole number in `0..max`; anything else reads as 0. */
export function clampWhole(value: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : 0;
}

/** The mat's reading as the page shows it; null reads as no reading. */
export function matReading(temperature: number | null | undefined): string {
  return typeof temperature === 'number' && Number.isFinite(temperature) ? `${temperature.toFixed(1)} °C` : 'No reading';
}

/** A strip colour, 12 hex digits `RRRRGGGGBBBB`, as the colour input's `#rrggbb` (the high byte of each channel). */
export function toInputColour(hex: string): string {
  return /^[0-9a-f]{12}$/i.test(hex) ? `#${hex.slice(0, 2)}${hex.slice(4, 6)}${hex.slice(8, 10)}`.toLowerCase() : '#000000';
}

/** The colour input's `#rrggbb` as a strip colour: each byte is written to both bytes of its channel. */
export function fromInputColour(colour: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (!match) return '000000000000';
  return match
    .slice(1)
    .map((byte) => byte.toLowerCase().repeat(2))
    .join('');
}

export const STEP_TEXT: Record<ScaleCalibrationState['step'], string> = {
  idle: 'Ready',
  zeroing: 'Finding the zero',
  calLatch: 'Measuring the known mass',
  taring: 'Taring',
  complete: 'Complete',
  error: 'Failed',
};

export const RESULT_TEXT: Record<string, string> = {
  ok: 'Calibrated',
  incomplete: 'Not complete',
  noZero: 'Find the zero first',
  notSettled: 'The weight did not settle',
  badWeight: 'The mass is not right',
  badDelta: 'The reading did not change enough',
  illConditioned: 'The readings cannot be told apart',
  outOfRange: 'Out of range',
  notIsolated: 'Take the platform off and put the mass on one load cell',
  none: '',
};

/** The mass typed for the latch, in grams: 1..10000, fractions allowed. */
export function validGrams(grams: number): boolean {
  return Number.isFinite(grams) && grams >= 1 && grams <= 10000;
}

/** A calibration step is running, so no other command is sent. */
export function calibrationBusy(state: ScaleCalibrationState | null): boolean {
  return state !== null && state.step !== 'idle' && state.step !== 'complete' && state.step !== 'error';
}

export const FEEDBACK_TYPES: Array<{ value: FeedbackRequest['type']; label: string; hint: string }> = [
  { value: 'bug', label: 'bug report', hint: 'Something does not work' },
  { value: 'feature', label: 'feature request', hint: 'Something that should be added' },
  { value: 'question', label: 'general feedback', hint: 'Thoughts or ideas' },
];

/** Streamline's text of the issue: the title in bold above the description. */
export function feedbackText(title: string, description: string): string {
  return `**${title.trim()}**\n\n${description.trim()}`;
}

/** The pages the manual links to; they open outside the skin. */
export const MANUAL_LINKS = [
  { id: 'quickstart', label: 'Quick Start Guide', url: 'https://decentespresso.com/doc/quickstart/' },
  { id: 'skin', label: 'User manual of this skin', url: 'https://github.com/Jan3kJ/decaid-pureflow/blob/main/README.md' },
];
