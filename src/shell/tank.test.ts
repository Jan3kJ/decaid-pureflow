import { describe, expect, it } from 'vitest';
import { MM_TO_ML, TANK_MAX_ML, shownTankMl, tankMl, tankText } from './tank';

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
