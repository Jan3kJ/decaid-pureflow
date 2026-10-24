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

/** How far, in milliseconds of its speed, a flick of the day grid carries on after the finger lifts. */
export const FLICK_MS = 300;
/** The most months one flick passes. */
export const FLICK_MAX = 12;
/** A finger that moves more than this many pixels drags the grid; its touch is no tap. */
export const DRAG_SLOP = 6;
/** A wheel turn of at least this many pixels is a mouse wheel's notch: one month. */
export const WHEEL_NOTCH = 40;
/** The travel, in pixels, of the small turns a touchpad sends that makes one month. */
export const WHEEL_STEP = 100;

/**
 * A drag of the day grid, `offset` pixels down (negative: up) on a grid `height` pixels tall:
 * the grid follows the finger as a list does, so dragging up brings the later month. The shown
 * month moves once more than half of the next one is in view; `months` is how far, `offset` what
 * is left of the drag on the new month.
 */
export function followDrag(offset: number, height: number): { months: number; offset: number } {
  if (height <= 0) return { months: 0, offset: 0 };
  const months = -Math.round(offset / height) || 0;
  return { months, offset: offset + months * height };
}

/**
 * Where the grid settles when the finger lifts at `offset` with `velocity` pixels per millisecond
 * (down positive): on whole months, the flick carried on for `FLICK_MS`, at most `FLICK_MAX`
 * months away. `offset` is then where the slide to rest starts, measured on the new month.
 */
export function snapDrag(offset: number, height: number, velocity: number): { months: number; offset: number } {
  if (height <= 0) return { months: 0, offset: 0 };
  const carried = -Math.round((offset + velocity * FLICK_MS) / height) || 0;
  const months = Math.max(-FLICK_MAX, Math.min(FLICK_MAX, carried));
  return { months, offset: offset + months * height };
}

/**
 * The wheel over the day grid: `travel` pixels gathered so far plus this turn's `delta` (down
 * positive, as a page scrolls). Down shows the later month: one per notch of a mouse wheel
 * (whose pixels differ with the screen's scale), one per `WHEEL_STEP` of a touchpad's small
 * turns; `travel` keeps the rest for the next turn.
 */
export function wheelMonths(travel: number, delta: number): { months: number; travel: number } {
  if (Math.abs(delta) >= WHEEL_NOTCH) return { months: Math.sign(delta), travel: 0 };
  const total = travel + delta;
  const months = Math.trunc(total / WHEEL_STEP) || 0;
  return { months, travel: total - months * WHEEL_STEP };
}
