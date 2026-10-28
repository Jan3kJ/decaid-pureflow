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
