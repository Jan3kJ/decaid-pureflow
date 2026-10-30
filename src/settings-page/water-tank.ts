// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/waterTank.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The tank's water in ml for the clean: Decaid reports the level in mm
// (`WaterLevels`), and Streamline turns it into ml with the TCL skin's table (`src/shell/tank.ts`). No UI.
import type { WaterLevels } from '../api';
import { MM_TO_ML, TANK_MAX_ML } from '../shell/tank';

/** ml, under which the clean warns: a clean uses about 300 ml. */
export const CLEAN_WATER_MIN_ML = 350;

/** The tank's water in ml, as Streamline shows it: the level rounded to whole mm, then the table. */
export function mmToMl(mm: number): number {
  const index = Math.max(0, Math.round(mm));
  return index >= MM_TO_ML.length ? TANK_MAX_ML : MM_TO_ML[index];
}

export interface CleanWater {
  /** ml in the tank; null while no level was read */
  ml: number | null;
  /** too little water for a clean */
  low: boolean;
}

/** The water for a clean: a level not read is not a warning, the clean's own 'out of water' stays. */
export function cleanWater(levels: WaterLevels | null): CleanWater {
  if (!levels) return { ml: null, low: false };
  const ml = mmToMl(levels.currentLevel);
  return { ml, low: ml < CLEAN_WATER_MIN_ML };
}
