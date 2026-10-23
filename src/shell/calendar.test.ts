import { describe, expect, it } from 'vitest';
import { addMonths, daysInMonth, isLeapYear, monthGrid, monthOf, todayIso } from './calendar';

describe('monthGrid', () => {
  it('starts the weeks on Monday', () => {
    // 2026-10-01 is a Thursday.
    const weeks = monthGrid({ year: 2026, month: 10 });
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
    expect(weeks).toHaveLength(5);
  });

  it('fills whole weeks only', () => {
    for (let month = 1; month <= 12; month += 1) {
      const weeks = monthGrid({ year: 2027, month });
      expect(weeks.every((week) => week.length === 7)).toBe(true);
      expect(weeks.flat().filter(Boolean)).toHaveLength(daysInMonth({ year: 2027, month }));
    }
  });

  it('puts a month that starts on Monday in the first column and one on Sunday in the last', () => {
    // 2026-06-01 is a Monday, 2026-11-01 a Sunday.
    expect(monthGrid({ year: 2026, month: 6 })[0][0]).toBe('2026-06-01');
    const november = monthGrid({ year: 2026, month: 11 });
    expect(november[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(november).toHaveLength(6);
  });

  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(monthGrid({ year: 2028, month: 2 }).flat().filter(Boolean).at(-1)).toBe('2028-02-29');
    expect(monthGrid({ year: 2027, month: 2 }).flat().filter(Boolean).at(-1)).toBe('2027-02-28');
    expect(daysInMonth({ year: 2000, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2100, month: 2 })).toBe(28);
  });
});

describe('addMonths', () => {
  it('steps by month across the year', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 10 }, 1)).toEqual({ year: 2026, month: 11 });
  });

  it('steps by year', () => {
    expect(addMonths({ year: 2026, month: 10 }, 12)).toEqual({ year: 2027, month: 10 });
    expect(addMonths({ year: 2026, month: 10 }, -12)).toEqual({ year: 2025, month: 10 });
  });
});

describe('monthOf and todayIso', () => {
  it('reads the month of an ISO date, null for none', () => {
    expect(monthOf('2026-10-08')).toEqual({ year: 2026, month: 10 });
    expect(monthOf('')).toBeNull();
    expect(monthOf('2026-13-01')).toBeNull();
  });

  it('gives the local date', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
