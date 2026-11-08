import { describe, expect, it } from 'vitest';
import { CLEAN_WATER_MIN_ML, cleanWarns, cleanWater } from './water-tank';

describe('cleanWater', () => {
  const at = (currentLevel: number) => cleanWater({ currentLevel, refillLevel: 5 });

  it('warns under 350 ml and not at or over it', () => {
    expect(CLEAN_WATER_MIN_ML).toBe(350);
    // 13 mm is 343 ml, 14 mm 371 ml.
    expect(at(13)).toEqual({ ml: 343, low: true });
    expect(at(14)).toEqual({ ml: 371, low: false });
    expect(at(0)).toEqual({ ml: 0, low: true });
    expect(at(38)).toEqual({ ml: 1042, low: false });
  });

  it('takes the ml the state line takes, between two mm too, and full above the table', () => {
    // 343 + 0.4 x 28 ml
    expect(at(13.4)).toEqual({ ml: 354, low: false });
    expect(at(13.2)).toEqual({ ml: 349, low: true });
    expect(at(-3)).toEqual({ ml: 0, low: true });
    expect(at(120)).toEqual({ ml: 2058, low: false });
  });

  it("takes the user's tank rows when there are any", () => {
    const rows = [
      { mm: 0.4, ml: 0 },
      { mm: 9.8, ml: 250 },
      { mm: 19.1, ml: 500 },
    ];
    // 250 + 2.2 / 9.3 x 250 ml, and 250 + 4.2 / 9.3 x 250 ml
    expect(cleanWater({ currentLevel: 12, refillLevel: 5 }, rows)).toEqual({ ml: 309, low: true });
    expect(cleanWater({ currentLevel: 14, refillLevel: 5 }, rows)).toEqual({ ml: 363, low: false });
    expect(cleanWater({ currentLevel: 14, refillLevel: 5 }, [])).toEqual({ ml: 371, low: false });
  });

  it('does not warn while no level was read', () => {
    expect(cleanWater(null)).toEqual({ ml: null, low: false });
  });
});

describe('cleanWarns', () => {
  it('follows the level while no clean runs', () => {
    expect(cleanWarns(false, true, null)).toBe(true);
    expect(cleanWarns(false, false, null)).toBe(false);
    // a stale start value does not matter after the end
    expect(cleanWarns(false, false, true)).toBe(false);
    expect(cleanWarns(false, true, false)).toBe(true);
  });

  it('shows no warning during a clean that started without one, however far the level falls', () => {
    expect(cleanWarns(true, true, false)).toBe(false);
  });

  it('keeps the warning during a clean that started with it, although the level rises over 350', () => {
    expect(cleanWarns(true, false, true)).toBe(true);
  });
});
