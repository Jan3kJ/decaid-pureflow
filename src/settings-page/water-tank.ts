// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/waterTank.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The tank's water in ml for the clean (spec 3.8 'Menu: clean'): Decaid reports the level in mm
// (`WaterLevels`), and Streamline turns it into ml with the TCL skin's table. No UI.
import type { WaterLevels } from '../api';

/** ml of water at a level, by the level in whole mm (0-69); above the table the tank is full. */
const MM_TO_ML = [
  0, 16, 43, 70, 97, 124, 151, 179, 206, 233, 261, 288, 316, 343, 371, 398, 426, 453, 481, 509, 537, 564, 592, 620, 648, 676, 704, 732,
  760, 788, 816, 844, 872, 900, 929, 957, 985, 1013, 1042, 1070, 1104, 1138, 1172, 1207, 1242, 1277, 1312, 1347, 1382, 1417, 1453,
  1488, 1523, 1559, 1594, 1630, 1665, 1701, 1736, 1772, 1808, 1843, 1879, 1915, 1951, 1986, 2022, 2058,
];
const TANK_MAX_ML = 2058;

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
