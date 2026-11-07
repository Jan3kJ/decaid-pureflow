// Quick Adjustments > Tank calibration: the guided fill that makes the user's own tank table. The
// user empties the tank and pours 250 ml at a time; at each step the page takes the level the
// sensor reads once it is steady. Nothing applies while it runs: 'done' saves all the rows at once
// (`tankRows` in src/settings.ts, read by `tankMl`). No UI.
import type { TankRow } from '../shell/tank';

/** ml poured at each step */
export const STEP_ML = 250;
/** ml in all from which the fill may stop: Decent's table carries the rest */
export const DONE_FROM_ML = 1000;
/** ml in all at the last step: the full tank */
export const FULL_ML = 2000;
/** ms, how long the level must stay within `STEADY_MM` before a row is taken */
export const STEADY_MS = 5000;
/** mm, how far the level may move over `STEADY_MS` and still be steady */
export const STEADY_MM = 0.5;
/** mm, how far one step of 250 ml may raise the level: Decent's table asks 7 to 9.6 mm */
export const RISE_MM = { min: 3, max: 15 };

/** One level from the machine, and when it came. */
export interface Reading {
  /** ms */
  at: number;
  mm: number;
}

/** A level as a row holds it: to 0.1 mm. */
export const tenth = (mm: number): number => Math.round(mm * 10) / 10;

/**
 * The readings a steady level is judged on: those of the last `STEADY_MS`, and the one before
 * them, the level that held when that time began. The machine may send a level only when it changes.
 */
export function recentReadings(readings: readonly Reading[], now: number): Reading[] {
  const start = now - STEADY_MS;
  let before = 0;
  readings.forEach((reading, i) => {
    if (reading.at <= start) before = i;
  });
  return readings.slice(before);
}

/** The level was read for `STEADY_MS` and moved less than `STEADY_MM` over it. */
export function isSteady(readings: readonly Reading[], now: number): boolean {
  const recent = recentReadings(readings, now);
  if (recent.length === 0 || now - recent[0].at < STEADY_MS) return false;
  const levels = recent.map((reading) => reading.mm);
  return Math.max(...levels) - Math.min(...levels) < STEADY_MM;
}

/** ml in all the next row is for: 0 for the empty tank, then a step more each; null once the tank is full. */
export function nextMl(rows: readonly TankRow[]): number | null {
  const ml = rows.length === 0 ? 0 : rows[rows.length - 1].ml + STEP_ML;
  return ml > FULL_ML ? null : ml;
}

/** 'done' is offered: the rows reach `DONE_FROM_ML`. */
export const canFinish = (rows: readonly TankRow[]): boolean => rows.length > 0 && rows[rows.length - 1].ml >= DONE_FROM_ML;

/** Why a level cannot be the next row, or null when it can: a step must raise the level by `RISE_MM`. */
export function stepProblem(rows: readonly TankRow[], mm: number): string | null {
  if (rows.length === 0) return null;
  const rise = tenth(mm - rows[rows.length - 1].mm);
  if (rise < RISE_MM.min) {
    return `The level rose ${rise.toFixed(1)} mm, less than ${RISE_MM.min} mm: let the water settle, or check that ${STEP_ML} ml went in.`;
  }
  if (rise > RISE_MM.max)
    return `The level rose ${rise.toFixed(1)} mm, more than ${RISE_MM.max} mm: check that ${STEP_ML} ml went in.`;
  return null;
}

/** The fill with one more row at this level, or the reason it is refused. */
export function takeRow(rows: readonly TankRow[], mm: number): { rows: TankRow[] } | { problem: string } {
  const ml = nextMl(rows);
  if (ml === null) return { problem: `The tank is full at ${FULL_ML} ml.` };
  const problem = stepProblem(rows, mm);
  return problem ? { problem } : { rows: [...rows, { mm: tenth(mm), ml }] };
}

/** Which table is in force, for the line 'using:'. */
export function usingText(saved: readonly TankRow[]): string {
  return saved.length === 0 ? "Decent's table" : `your table, ${saved.length} rows to ${saved[saved.length - 1].ml} ml`;
}
