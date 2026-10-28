// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
// src/settings/settings.js (UI_ZOOM_MAP, CHART_LINE_WIDTH_MAP, renderFontSizeSettings).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// Skin > Display: Streamline's Display Size and Chart Line Width. Each is a factor that
// `applyDisplay` puts on `:root`: `--display-size` on the root font, so every size in rem
// follows (app.css), `--line-width` on the stroke of every graph's curves.

/** One choice of Skin > Display: its label and the factor it stands for. */
export interface DisplayChoice {
  label: string;
  value: number;
}

export const DISPLAY_SIZES: DisplayChoice[] = [
  { label: 'small', value: 0.85 },
  { label: 'medium', value: 1 },
  { label: 'large', value: 1.15 },
  { label: 'extra large', value: 1.3 },
];

export const LINE_WIDTHS: DisplayChoice[] = [
  { label: 'thin', value: 0.6 },
  { label: 'normal', value: 1 },
  { label: 'thick', value: 1.5 },
  { label: 'extra thick', value: 2 },
];

export function applyDisplay(
  display: { displaySize: number; lineWidth: number },
  root: Pick<HTMLElement, 'style'> = document.documentElement,
): void {
  root.style.setProperty('--display-size', `${display.displaySize}`);
  root.style.setProperty('--line-width', `${display.lineWidth}`);
}

/**
 * Every shown weight of the scale (spec 3.18 item 3): one place after the point and the unit, e.g.
 * '36.0 g'. A reading from -0.1 to 0.1 g, both ends included, is the scale's jitter around zero and
 * shows as '0.0 g', never '-0.0'; the band is applied to the raw reading before it is rounded, and
 * a weight below it stays negative ('-0.6 g'). Only the text changes: callers keep the raw reading
 * for the milk, the tare and every calculation. No reading shows as '–'. `unit` is what follows the
 * number: ' g' by default, '' where the unit stands in its own element.
 */
export function gramsOf(weight: number | null | undefined, unit = ' g'): string {
  if (typeof weight !== 'number' || !Number.isFinite(weight)) return '–';
  const shown = Math.abs(weight) <= 0.1 ? 0 : weight;
  const text = shown.toFixed(1);
  return `${text === '-0.0' ? '0.0' : text}${unit}`;
}
