// The state line's temperatures, filtered: the raw frames jitter across a rounding
// border, so the group and steam values shown are an exponential moving average of them. Only
// the display reads it; graphs, shot records and writes to the machine keep the raw frames.

/** ms, the filter's time constant: at 4 frames a second about six of them */
export const SMOOTH_TAU_MS = 1500;
/** ms, a value older than this is stale (a lost link), and the filter restarts */
export const SMOOTH_STALE_MS = 3000;
/** °C, a jump larger than this (a reconnect, a heater switched) restarts the filter */
export const SMOOTH_JUMP = 5;

/** A filtered value and the time of the frame it last took, in milliseconds. */
export interface Smoothed {
  t: number;
  value: number;
}

/**
 * The filter after a new value at time `t` (ms): the average moves towards the value by
 * `1 - e^(-dt/τ)`, so frames that come irregularly weigh by the time they cover. Without a last
 * value, after a gap of more than `SMOOTH_STALE_MS` or a jump of more than `SMOOTH_JUMP`, it starts
 * again from the value.
 */
export function smooth(last: Smoothed | null, t: number, value: number): Smoothed {
  if (!last || !Number.isFinite(last.value) || !Number.isFinite(value)) return { t, value };
  const dt = t - last.t;
  if (dt < 0 || dt > SMOOTH_STALE_MS || Math.abs(value - last.value) > SMOOTH_JUMP) return { t, value };
  const k = 1 - Math.exp(-dt / SMOOTH_TAU_MS);
  return { t, value: last.value + k * (value - last.value) };
}
