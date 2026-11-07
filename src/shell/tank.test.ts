import { describe, expect, it } from 'vitest';
import { MM_TO_ML, TANK_MAX_ML, shownTankMl, tankMl, tankRowsOk, tankText } from './tank';

describe('tankMl', () => {
  it("gives Streamline's table at a whole mm", () => {
    expect(tankMl(0)).toBe(0);
    expect(tankMl(20)).toBe(537);
    expect(tankMl(40)).toBe(1104);
    expect(tankMl(60)).toBe(1808);
    expect(tankMl(69)).toBe(2058);
  });

  it('holds the table as Streamline 0.2.18 has it: 68 entries, growing, the last the full tank', () => {
    expect(MM_TO_ML).toHaveLength(68);
    expect(MM_TO_ML.at(-1)).toBe(TANK_MAX_ML);
    expect(MM_TO_ML.every((ml, mm) => mm === 0 || ml > MM_TO_ML[mm - 1])).toBe(true);
  });

  it('is linear between two entries', () => {
    expect(tankMl(40.8)).toBeCloseTo(1104 + 0.8 * 34);
    expect(tankMl(41.8)).toBeCloseTo(1138 + 0.8 * 34);
    expect(tankMl(0.5)).toBe(8);
    expect(tankMl(19.5)).toBe(523);
    expect(tankMl(66.5)).toBe(2040);
  });

  it('is the full tank above the table and nothing under 0', () => {
    expect(tankMl(67)).toBe(2058);
    expect(tankMl(69.4)).toBe(2058);
    expect(tankMl(120)).toBe(2058);
    expect(tankMl(-3)).toBe(0);
    expect(tankMl(Number.NaN)).toBe(0);
  });
});

describe('shownTankMl', () => {
  it('rounds to 10 ml', () => {
    expect(shownTankMl(40.8)).toBe(1130);
    expect(shownTankMl(41.8)).toBe(1170);
    expect(shownTankMl(15)).toBe(400);
    expect(shownTankMl(20)).toBe(540);
    expect(shownTankMl(0)).toBe(0);
  });
});

describe('tankText', () => {
  it('says ml, never litres, or the machine mm', () => {
    expect(tankText(40.8, 'ml')).toBe('1130 ml');
    expect(tankText(69, 'ml')).toBe('2060 ml');
    expect(tankText(41.8, 'mm')).toBe('42 mm');
  });
});

describe("tankMl with the user's rows", () => {
  /** an empty tank and four pours of 250 ml, as the calibration takes them */
  const rows = [
    { mm: 0.4, ml: 0 },
    { mm: 9.8, ml: 250 },
    { mm: 19.1, ml: 500 },
    { mm: 27.5, ml: 750 },
    { mm: 35.6, ml: 1000 },
  ];

  it("gives the user's ml at a row and a straight line between two rows", () => {
    expect(tankMl(9.8, rows)).toBe(250);
    expect(tankMl(35.6, rows)).toBe(1000);
    expect(tankMl(14.45, rows)).toBeCloseTo(375);
    expect(tankMl(23.3, rows)).toBeCloseTo(625);
  });

  it("adds Decent's table above the last row, up to the full tank", () => {
    // the table: 957 + 0.6 x 28 ml at 35.6 mm, 1104 ml at 40 mm
    expect(tankMl(40, rows)).toBeCloseTo(1000 + 1104 - 973.8);
    expect(tankMl(66, rows)).toBeCloseTo(1000 + 2022 - 973.8);
    expect(tankMl(69, rows)).toBe(TANK_MAX_ML);
    expect(tankMl(120, rows)).toBe(TANK_MAX_ML);
  });

  it('gives nothing under the empty row and under 0', () => {
    expect(tankMl(0.4, rows)).toBe(0);
    expect(tankMl(0.2, rows)).toBe(0);
    expect(tankMl(0, rows)).toBe(0);
    expect(tankMl(-3, rows)).toBe(0);
    expect(tankMl(Number.NaN, rows)).toBe(0);
  });

  it("moves the table to one row: the table's steps from it, up and down", () => {
    const one = [{ mm: 30, ml: 700 }];
    expect(tankMl(30, one)).toBe(700);
    expect(tankMl(40, one)).toBe(700 + 1104 - 816);
    expect(tankMl(20, one)).toBe(700 - (816 - 537));
    expect(tankMl(2, one)).toBe(0);
  });

  it('lets the last row stand above a full table', () => {
    const big = [
      { mm: 10, ml: 300 },
      { mm: 60, ml: 2100 },
    ];
    expect(tankMl(60, big)).toBe(2100);
    expect(tankMl(69, big)).toBe(2100);
  });

  it("gives Decent's table for rows that do not rise or are not numbers, and for none", () => {
    const levels = [0.5, 13.4, 20, 40.8, 69];
    const table = levels.map((mm) => tankMl(mm));
    const odd = [
      [],
      [
        { mm: 10, ml: 0 },
        { mm: 9, ml: 250 },
      ],
      [
        { mm: 5, ml: 250 },
        { mm: 10, ml: 250 },
      ],
      [{ mm: Number.NaN, ml: 0 }],
      [{ mm: 5, ml: -1 }],
    ];
    for (const list of odd) expect(levels.map((mm) => tankMl(mm, list))).toEqual(table);
    expect(tankRowsOk(rows)).toBe(true);
    expect(tankRowsOk([{ mm: 30, ml: 700 }])).toBe(true);
    expect(odd.some(tankRowsOk)).toBe(false);
  });

  it('carries the rows into the shown ml and the state line, never into the mm', () => {
    expect(shownTankMl(12, rows)).toBe(310);
    expect(tankText(40, 'ml', rows)).toBe('1130 ml');
    expect(tankText(15, 'ml', rows)).toBe('390 ml');
    expect(tankText(15, 'mm', rows)).toBe('15 mm');
  });
});
