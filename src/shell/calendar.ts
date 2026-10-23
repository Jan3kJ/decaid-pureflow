// The month grid of the date picker: ISO dates (`YYYY-MM-DD`), weeks from Monday.

/** A month: `month` is 1 to 12. */
export interface Month {
  year: number;
  month: number;
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

export function isoDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** The local date of the moment, as ISO. */
export function todayIso(now: Date = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** The month of an ISO date; null for '' or anything else. */
export function monthOf(iso: string): Month | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth({ year, month }: Month): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** The month `count` months later (earlier when negative). */
export function addMonths({ year, month }: Month, count: number): Month {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** The weekday of the month's first day, 0 for Monday to 6 for Sunday. */
function firstWeekday({ year, month }: Month): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/** The month's weeks, Monday first: each a row of seven ISO dates, null outside the month. */
export function monthGrid(of: Month): (string | null)[][] {
  const cells: (string | null)[] = Array.from({ length: firstWeekday(of) }, () => null);
  for (let day = 1; day <= daysInMonth(of); day += 1) cells.push(isoDate(of.year, of.month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}
