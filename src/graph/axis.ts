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
