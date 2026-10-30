// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/settings.js (renderPresenceSettings, formatDaysOfWeek, formatKeepAwakeDuration,
// handleSaveSchedule).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// Miscellaneous > Presence Detection's wake schedules, without UI:
// a schedule as one line, and the schedule a form gives. Presence and the sleep timeout are
// fields (`PRESENCE` in fields.ts).
import type { WakeSchedule, WakeScheduleInput } from '../api';

/** ISO 8601 weekdays: 1 Monday to 7 Sunday. */
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The longest keep-awake Decaid takes, minutes (12 hours). */
export const KEEP_AWAKE_MAX = 720;

export function daysText(days: number[]): string {
  if (!days.length || days.length === 7) return 'Every day';
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => DAYS[day - 1])
    .join(', ');
}

export function keepAwakeText(minutes: number | null | undefined): string {
  if (!minutes || minutes < 1) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  return hours ? `${hours} h` : `${rest} min`;
}

export function scheduleText(schedule: WakeSchedule): string {
  const awake = keepAwakeText(schedule.keepAwakeFor);
  return `${schedule.time}, ${daysText(schedule.daysOfWeek)}${awake ? `, awake for ${awake}` : ''}`;
}

/** What the form edits. */
export interface ScheduleForm {
  /** minutes since midnight */
  minutes: number;
  days: number[];
  /** 0: wake only */
  keepAwake: number;
  enabled: boolean;
}

export const NEW_SCHEDULE: ScheduleForm = { minutes: 7 * 60, days: [], keepAwake: 0, enabled: true };

export function formOf(schedule: WakeSchedule): ScheduleForm {
  const [hours, minutes] = schedule.time.split(':').map(Number);
  return {
    minutes: (hours || 0) * 60 + (minutes || 0),
    days: [...schedule.daysOfWeek],
    keepAwake: schedule.keepAwakeFor ?? 0,
    enabled: schedule.enabled,
  };
}

/**
 * The schedule a form writes: "HH:MM", the days in order, and a keep-awake of 1-720 minutes or
 * null for none (a PUT needs the null to clear one that was set).
 */
export function scheduleOf(form: ScheduleForm): WakeScheduleInput {
  const time = `${String(Math.floor(form.minutes / 60)).padStart(2, '0')}:${String(form.minutes % 60).padStart(2, '0')}`;
  const keepAwake = Math.round(form.keepAwake);
  return {
    time,
    daysOfWeek: [...new Set(form.days)].filter((day) => day >= 1 && day <= 7).sort((a, b) => a - b),
    enabled: form.enabled,
    keepAwakeFor: keepAwake >= 1 ? Math.min(KEEP_AWAKE_MAX, keepAwake) : null,
  };
}
