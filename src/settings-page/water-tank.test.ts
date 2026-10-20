import { describe, expect, it } from 'vitest';
import { CLEAN_WATER_MIN_ML, cleanWater, mmToMl } from './water-tank';

describe('mmToMl', () => {
  it("takes Streamline's table, rounded to whole mm", () => {
    expect(mmToMl(0)).toBe(0);
    expect(mmToMl(1)).toBe(16);
    expect(mmToMl(13.4)).toBe(343);
    expect(mmToMl(13.6)).toBe(371);
    expect(mmToMl(38)).toBe(1042);
    expect(mmToMl(69)).toBe(2058);
  });

  it('is 0 under the tank and full above the table', () => {
    expect(mmToMl(-3)).toBe(0);
    expect(mmToMl(70)).toBe(2058);
    expect(mmToMl(120)).toBe(2058);
  });
});

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

  it('does not warn while no level was read', () => {
    expect(cleanWater(null)).toEqual({ ml: null, low: false });
  });
});
