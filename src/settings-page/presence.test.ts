import { describe, expect, it } from 'vitest';
import { NEW_SCHEDULE, daysText, formOf, keepAwakeText, scheduleOf, scheduleText } from './presence';

describe('the wake schedules', () => {
  it('writes a schedule as Decaid takes it: HH:MM, the days in order, a keep-awake or null', () => {
    expect(scheduleOf({ minutes: 6 * 60 + 5, days: [5, 1, 3, 3], keepAwake: 90, enabled: true })).toEqual({
      time: '06:05',
      daysOfWeek: [1, 3, 5],
      enabled: true,
      keepAwakeFor: 90,
    });
    expect(scheduleOf({ ...NEW_SCHEDULE, keepAwake: 0 }).keepAwakeFor).toBeNull();
    expect(scheduleOf({ ...NEW_SCHEDULE, keepAwake: 900 }).keepAwakeFor).toBe(720);
    expect(scheduleOf(NEW_SCHEDULE).time).toBe('07:00');
  });

  it('edits a schedule as it is', () => {
    const schedule = { id: 'a', time: '21:30', daysOfWeek: [6, 7], enabled: false, keepAwakeFor: null };
    expect(formOf(schedule)).toEqual({ minutes: 21 * 60 + 30, days: [6, 7], keepAwake: 0, enabled: false });
    expect(scheduleOf(formOf(schedule))).toEqual({ time: '21:30', daysOfWeek: [6, 7], enabled: false, keepAwakeFor: null });
  });

  it('shows a schedule in one line', () => {
    expect(daysText([])).toBe('Every day');
    expect(daysText([7, 1])).toBe('Mon, Sun');
    expect(keepAwakeText(75)).toBe('1 h 15 min');
    expect(keepAwakeText(120)).toBe('2 h');
    expect(keepAwakeText(null)).toBe('');
    expect(scheduleText({ id: 'a', time: '06:00', daysOfWeek: [1, 2, 3, 4, 5], enabled: true, keepAwakeFor: 60 })).toBe(
      '06:00, Mon, Tue, Wed, Thu, Fri, awake for 1 h',
    );
  });
});
