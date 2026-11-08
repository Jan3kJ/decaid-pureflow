// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/waterTank.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The tank's water in ml for the clean: Decaid reports the level in mm
// (`WaterLevels`), turned into ml as the state line does (`tankMl`, `src/shell/tank.ts`): the TCL
// skin's table, or the user's own tank rows. No UI.
import type { WaterLevels } from '../api';
import { tankMl, type TankRow } from '../shell/tank';

/** ml, under which the clean warns: a clean uses about 300 ml. */
export const CLEAN_WATER_MIN_ML = 350;

export interface CleanWater {
  /** ml in the tank; null while no level was read */
  ml: number | null;
  /** too little water for a clean */
  low: boolean;
}

/** The water for a clean: a level not read is not a warning, the clean's own 'out of water' stays. */
export function cleanWater(levels: WaterLevels | null, rows: readonly TankRow[] = []): CleanWater {
  if (!levels) return { ml: null, low: false };
  const ml = Math.round(tankMl(levels.currentLevel, rows));
  return { ml, low: ml < CLEAN_WATER_MIN_ML };
}

/**
 * Whether the clean warns. The level falls while the clean draws water, so during the run the
 * check is not made again: the warning as it was at the start stays (shown, or not) until the
 * clean ends or is cancelled, then the live check follows the level again.
 * `atStart` is the live check taken when the run began, null while no run is on.
 */
export function cleanWarns(running: boolean, live: boolean, atStart: boolean | null): boolean {
  return running && atStart !== null ? atStart : live;
}
