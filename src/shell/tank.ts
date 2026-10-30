// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
// src/modules/waterTank.js (MM_TO_ML, TANK_MAX_ML, waterTankUnit); 0.2.18 has the same table.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The tank's water in ml: the DE1 measures the water's height in mm
// (`WaterLevels`), and Streamline turns it into ml with a table taken from the TCL skin, one
// entry per mm. The tank widens upward, so the table is not linear.

/** ml of water at a level, by the level in whole mm from 0; above the table the tank is full. */
export const MM_TO_ML: readonly number[] = [
  0, 16, 43, 70, 97, 124, 151, 179, 206, 233, 261, 288, 316, 343, 371, 398, 426, 453, 481, 509, 537, 564, 592, 620, 648, 676, 704, 732,
  760, 788, 816, 844, 872, 900, 929, 957, 985, 1013, 1042, 1070, 1104, 1138, 1172, 1207, 1242, 1277, 1312, 1347, 1382, 1417, 1453,
  1488, 1523, 1559, 1594, 1630, 1665, 1701, 1736, 1772, 1808, 1843, 1879, 1915, 1951, 1986, 2022, 2058,
];

/** ml, the full tank: any level above the table */
export const TANK_MAX_ML = 2058;

/** The units the tank is shown in (Quick Adjustments > Water Tank 'tank unit'). */
export type TankUnit = 'ml' | 'mm';

export const TANK_UNITS: { label: string; value: TankUnit }[] = [
  { label: 'ml', value: 'ml' },
  { label: 'mm', value: 'mm' },
];

/**
 * The tank's water in ml at a level in mm: the table's entry at a whole mm, linear between two
 * entries (the machine sends fractions), the full tank above the table, nothing under 0.
 */
export function tankMl(mm: number): number {
  if (!(mm > 0)) return 0;
  const last = MM_TO_ML.length - 1;
  if (mm >= last) return TANK_MAX_ML;
  const below = Math.floor(mm);
  return MM_TO_ML[below] + (mm - below) * (MM_TO_ML[below + 1] - MM_TO_ML[below]);
}

/** ml as shown: rounded to 10 ml, as the sensor is not better than a mm (about 30 ml). */
export const shownTankMl = (mm: number): number => Math.round(tankMl(mm) / 10) * 10;

/** The tank's level as the state line shows it: '1130 ml' (never litres) or '42 mm'. */
export function tankText(mm: number, unit: TankUnit): string {
  return unit === 'mm' ? `${mm.toFixed(0)} mm` : `${shownTankMl(mm)} ml`;
}
