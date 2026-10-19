// The axes of the shot graph. Pure: the samples in, the axis out.

export interface TimeAxis {
  /** s, the right end of the axis */
  seconds: number;
  /** s, where a number stands */
  ticks: number[];
}

/**
 * A finished or stored shot (`fit`) fills the width: the axis ends at its last sample,
 * whatever its length. A running one has an axis of at least `minSeconds` that grows in
 * steps of ten seconds, so the curve does not rescale with every frame.
 */
export function timeAxis(last: number, fit: boolean, minSeconds = 30): TimeAxis {
  const seconds = fit && last > 0 ? last : Math.max(minSeconds, Math.ceil(last / 10) * 10);
  const step = seconds <= 20 ? 5 : seconds <= 60 ? 10 : seconds <= 120 ? 20 : 30;
  const ticks: number[] = [];
  for (let tick = 0; tick <= seconds; tick += step) ticks.push(tick);
  return { seconds, ticks };
}

/** The scale of pressure, flow and weight flow: its top and where a number stands. */
export interface MainScale {
  max: number;
  ticks: number[];
}

/** bar and ml/s: a shot's scale ends here unless a value goes over it (founder, 2026-10-17) */
export const SHOT_SCALE = 10;
/** bar and ml/s: the scale of a shot with a value over SHOT_SCALE; higher values are held at it */
export const SHOT_SCALE_OPEN = 12;

/**
 * The shot graph's scale of pressure, flow and weight flow (spec 3.8): 0 to 10 with a number
 * every 2, opened to 12 only when a drawn value (measured or target; null is a gap) goes over
 * 10. The live graph and the history's draw with it.
 */
export function shotScale(values: readonly (readonly (number | null)[] | undefined)[]): MainScale {
  const over = values.some((series) => (series ?? []).some((value) => value !== null && value > SHOT_SCALE));
  const max = over ? SHOT_SCALE_OPEN : SHOT_SCALE;
  const ticks: number[] = [];
  for (let tick = 0; tick <= max; tick += 2) ticks.push(tick);
  return { max, ticks };
}

/** A fixed scale (steam, the step editor's preview): a number at every quarter. */
export function fixedScale(max: number): MainScale {
  return { max, ticks: [0, 1, 2, 3, 4].map((tick) => (tick * max) / 4) };
}

/** s, the running axis of a shot when nothing at all is known of its length */
export const DEFAULT_SHOT_SECONDS = 30;

/**
 * Where a running shot's time axis starts (spec 3.8): the expected length in s, rounded up to
 * ten seconds; DEFAULT_SHOT_SECONDS without one. `timeAxis` grows it in steps of ten past that.
 */
export function startSeconds(expected: number | null | undefined): number {
  const seconds = typeof expected === 'number' && Number.isFinite(expected) && expected > 0 ? expected : DEFAULT_SHOT_SECONDS;
  return Math.ceil(seconds / 10 - 1e-9) * 10;
}

/** °C, the ends of the temperature band */
export interface TemperatureBand {
  min: number;
  max: number;
}

/**
 * The temperature band: a fixed one where a graph has one (steam, 140 to 170 °C, spec 3.7),
 * else 80 to 100 °C, opened in steps of ten for a colder or hotter value.
 */
export function temperatureBand(values: readonly number[], fixed?: TemperatureBand): TemperatureBand {
  if (fixed) return fixed;
  const low = values.length ? Math.min(...values) : 80;
  const high = values.length ? Math.max(...values) : 100;
  return { min: Math.min(80, Math.floor(low / 10) * 10), max: Math.max(100, Math.ceil(high / 10) * 10) };
}

/** A value on a band's scale: held inside it, so a line never leaves its band. */
export function inBand(value: number, band: TemperatureBand): number {
  return Math.min(band.max, Math.max(band.min, value));
}
