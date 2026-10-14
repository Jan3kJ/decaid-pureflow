// The time axis of the shot graph. Pure: the last sample's time in, the axis out.

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
