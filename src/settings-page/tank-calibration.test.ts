import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import type { Skin } from '../shell/skin.svelte';
import type { TankRow } from '../shell/tank';
import TankCalibration from './TankCalibration.svelte';
import {
  DONE_FROM_ML,
  FULL_ML,
  RISE_MM,
  STEADY_MM,
  STEADY_MS,
  STEP_ML,
  canFinish,
  isSteady,
  judge,
  nextMl,
  recentReadings,
  stepProblem,
  takeRow,
  tenth,
  usingText,
  type Reading,
  type Verdict,
} from './tank-calibration';

/** The rows of a fill to `ml` in all, 8.5 mm a step from 0.4 mm. */
const fill = (ml: number): TankRow[] =>
  Array.from({ length: ml / STEP_ML + 1 }, (_, i) => ({ mm: tenth(0.4 + 8.5 * i), ml: i * STEP_ML }));

describe('the steps of the fill', () => {
  it('starts at the empty tank and goes 250 ml at a time to the full tank', () => {
    expect([STEP_ML, DONE_FROM_ML, FULL_ML]).toEqual([250, 1000, 2000]);
    expect(nextMl([])).toBe(0);
    expect(nextMl(fill(0))).toBe(250);
    expect(nextMl(fill(1750))).toBe(2000);
    expect(nextMl(fill(2000))).toBeNull();
  });

  it("offers 'done' from 1000 ml", () => {
    expect(canFinish([])).toBe(false);
    expect(canFinish(fill(750))).toBe(false);
    expect(canFinish(fill(1000))).toBe(true);
    expect(canFinish(fill(2000))).toBe(true);
  });

  it('takes a row to 0.1 mm when the level rose 3 to 15 mm', () => {
    expect(takeRow([], 0.43)).toEqual({ rows: [{ mm: 0.4, ml: 0 }] });
    expect(takeRow(fill(0), 9.86)).toEqual({ rows: [...fill(0), { mm: 9.9, ml: 250 }] });
    expect(takeRow(fill(0), 0.4 + RISE_MM.min)).toHaveProperty('rows');
    expect(takeRow(fill(0), 0.4 + RISE_MM.max)).toHaveProperty('rows');
  });

  it('refuses a step that rose too little or too much, and one over the full tank', () => {
    expect(stepProblem(fill(0), 2.4)).toBe(
      'The level rose 2.0 mm, less than 3 mm: let the water settle, or check that 250 ml went in.',
    );
    expect(stepProblem(fill(0), 16)).toBe('The level rose 15.6 mm, more than 15 mm: check that 250 ml went in.');
    expect(takeRow(fill(0), 0.4)).toEqual({ problem: stepProblem(fill(0), 0.4) });
    expect(takeRow(fill(2000), 80)).toEqual({ problem: 'The tank is full at 2000 ml.' });
  });

  it('says which table is in force', () => {
    expect(usingText([])).toBe("Decent's table");
    expect(usingText(fill(1000))).toBe('your table, 5 rows to 1000 ml');
  });
});

describe('a steady level', () => {
  it('is one read for 5 s that moved less than 0.5 mm', () => {
    expect([STEADY_MS, STEADY_MM]).toEqual([5000, 0.5]);
    const still = [{ at: 0, mm: 10 }];
    expect(isSteady([], 10_000)).toBe(false);
    expect(isSteady(still, 4999)).toBe(false);
    expect(isSteady(still, 5000)).toBe(true);
    expect(isSteady([...still, { at: 3000, mm: 10.4 }], 6000)).toBe(true);
    expect(isSteady([...still, { at: 3000, mm: 10.5 }], 6000)).toBe(false);
  });

  it('counts the level that held when the 5 s began, as the machine sends a level only when it changes', () => {
    const pour = [
      { at: 0, mm: 10 },
      { at: 1000, mm: 14 },
      { at: 2000, mm: 18.5 },
    ];
    expect(isSteady(pour, 6000)).toBe(false);
    expect(isSteady(pour, 7000)).toBe(true);
    expect(recentReadings(pour, 7000)).toEqual([{ at: 2000, mm: 18.5 }]);
    expect(recentReadings(pour, 6500)).toEqual(pour.slice(1));
  });
});

/** The page's way: readings kept by `recentReadings`, one verdict per 500 ms tick. */
function simulate(level: (at: number) => number | null, every: number, until: number): boolean[] {
  let readings: Reading[] = [];
  let verdict: Verdict | null = null;
  const seen: boolean[] = [];
  for (let t = 0; t <= until; t += 100) {
    const mm = t % every === 0 ? level(t) : null;
    if (mm !== null) readings = [...recentReadings(readings, t), { at: t, mm }];
    if (t % 500 === 0) {
      verdict = judge(verdict, readings, t);
      seen.push(verdict.steady);
    }
  }
  return seen;
}

describe('the verdict per tick', () => {
  const noise = [100.0, 100.1, 99.9, 100.2, 99.9];

  it('is steady from 5 s on for a level that toggles by 0.1 mm every 300 ms, and stays steady for 30 s', () => {
    let k = 0;
    const seen = simulate(() => noise[k++ % noise.length], 300, 30_000);
    const first = seen.indexOf(true);
    expect(first * 500).toBeLessThanOrEqual(6500);
    expect(seen.slice(first).every(Boolean)).toBe(true);
    expect(seen.slice(0, 10).some(Boolean)).toBe(false);
  });

  it('is not steady for a spread of 0.5 mm or more', () => {
    const seen = simulate((at) => (Math.floor(at / 300) % 2 === 0 ? 100 : 100.5), 300, 30_000);
    expect(seen.some(Boolean)).toBe(false);
  });

  it('holds when the machine sends nothing for a while', () => {
    const seen = simulate((at) => (at === 0 ? 100 : null), 100, 30_000);
    expect(seen.slice(11).every(Boolean)).toBe(true);
  });

  it('lets one look that disagrees leave the verdict as it was, and flips on the second', () => {
    const steady: Verdict = { steady: true, pending: false };
    const still = [{ at: 0, mm: 10 }];
    const moved = [...still, { at: 6000, mm: 11 }];
    const first = judge(steady, moved, 6000);
    expect(first).toEqual({ steady: true, pending: true });
    expect(judge(first, still, 6500)).toEqual({ steady: true, pending: false });
    expect(judge(first, moved, 6500)).toEqual({ steady: false, pending: false });
    expect(judge(null, moved, 6000)).toEqual({ steady: false, pending: false });
  });
});

/** A skin as the page reads it: the link, the tank's level and the settings. */
function skinWith(level: number | null, tankRows: TankRow[] = []): Skin {
  const settings: Settings = { ...DEFAULT_SETTINGS, tankRows };
  return {
    link: 'machine',
    water: level === null ? null : { currentLevel: level, refillLevel: 5 },
    settings,
    setSettings: () => undefined,
  } as unknown as Skin;
}

const page = (skin: Skin) => render(TankCalibration, { props: { skin } }).body;

describe('the page', () => {
  it("shows the live level, the amount to pour and Decent's table at first", () => {
    const html = page(skinWith(18.73));
    expect(html).toContain("Decent's table");
    expect(html).toContain('18.7 mm');
    expect(html).toContain('start with an empty tank: empty it completely (set a refill kit to force off first)');
    expect(html).toContain('then tap next to take the empty tank as the first row, 0 ml');
    expect(html).toContain('start with an empty tank. Empty it completely');
    expect(html).toContain('1 g = 1 ml');
    expect(html).toContain('about 30 ml');
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*data-testid="tank-calibration-next"|<button[^>]*data-testid="tank-calibration-next"[^>]*disabled/,
    );
    expect(html).not.toContain('tank-calibration-back');
    expect(html).not.toContain('tank-calibration-done');
    expect(html).not.toContain('tank-calibration-again');
  });

  it('says when the machine sends no level', () => {
    const html = page(skinWith(null));
    expect(html).toContain('no level from the machine');
    expect(html).toMatch(/data-testid="tank-calibration-level"[^>]*>–</);
  });

  it("offers the way back to Decent's table while the user's own table is in force", () => {
    const html = page(skinWith(30, fill(1000)));
    expect(html).toContain('your table, 5 rows to 1000 ml');
    expect(html).toContain("back to decent's table");
  });

  it("offers 'show table' only with saved rows, and lists none until it is tapped", () => {
    const own = page(skinWith(30, fill(1000)));
    expect(own).toContain('show table');
    expect(own).not.toContain('tank-calibration-saved-row');
    expect(page(skinWith(30))).not.toContain('tank-calibration-table');
  });

  it('has its buttons in lower case', () => {
    const html = page(skinWith(30, fill(1000)));
    for (const [, word] of html.matchAll(/<button[^>]*>([^<]*)</g)) expect(word.trim()).toBe(word.trim().toLowerCase());
  });
});
