// The picker's estimate (spec 3.16 'The picture'): the modelled shot of `predictShot` as the
// series `ShotGraph` draws, with the profile's targets and limits under it on the model's time.
// Pure: no DOM and no Svelte.
//
// The model's steps start and end where the coffee ends them, not at their seconds, so each
// step's targets (as `stepCurve` draws them: a ramp from where the step starts to where it ends,
// a last step cut at `lastStepSeconds`) are laid across the span the model gave that step. A step
// the model did not reach (the stop weight ended the shot first) draws nothing. The model's
// pressure and flow jump for one sample where a step ends on its exit; a median of three
// samples takes that out and keeps the steps' edges.
import type { Profile } from '../api';
import { stepCurve, type CurveOptions } from './curve';
import { predictShot, type Puck } from './predict';

export interface ShotEstimate {
  /** s, the model's samples */
  t: number[];
  /** ml/s, bar and °C: the model's */
  flow: number[];
  pressure: number[];
  temperature: number[];
  /** the profile's targets on the model's time; null where a step does not drive the quantity */
  targetFlow: (number | null)[];
  targetPressure: (number | null)[];
  targetTemperature: (number | null)[];
  /** the steps' limits on the model's time; null where a step has none */
  pressureLimit: (number | null)[];
  flowLimit: (number | null)[];
  /** s, where the model starts each step after the first */
  borders: number[];
  /** s, the end of the modelled shot; 0 for a profile without steps */
  seconds: number;
}

/** Each value the median of it and its two neighbours; the first and last stay. */
export function median3(values: readonly number[]): number[] {
  return values.map((value, i) => {
    if (i === 0 || i === values.length - 1) return value;
    const [a, b, c] = [values[i - 1], value, values[i + 1]];
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  });
}

/** The estimate of a profile's shot; a profile without steps gives empty series. */
export function shotEstimate(
  profile: Pick<Profile, 'steps' | 'target_weight'>,
  options: CurveOptions = {},
  puck?: Puck,
): ShotEstimate {
  const shot = predictShot(profile, puck);
  if (shot.steps.length === 0) {
    return {
      t: [],
      flow: [],
      pressure: [],
      temperature: [],
      targetFlow: [],
      targetPressure: [],
      targetTemperature: [],
      pressureLimit: [],
      flowLimit: [],
      borders: [],
      seconds: 0,
    };
  }
  const curve = stepCurve(profile, options);
  const series = {
    targetFlow: [] as (number | null)[],
    targetPressure: [] as (number | null)[],
    targetTemperature: [] as (number | null)[],
    pressureLimit: [] as (number | null)[],
    flowLimit: [] as (number | null)[],
  };
  const sources = {
    targetFlow: curve.flow,
    targetPressure: curve.pressure,
    targetTemperature: curve.temperature,
    pressureLimit: curve.pressureLimit,
    flowLimit: curve.flowLimit,
  };
  let span = 0;
  for (const time of shot.t) {
    // A sample on a border is the next step's: its targets start there.
    while (span < shot.steps.length - 1 && time >= shot.steps[span + 1].start - 1e-9) span += 1;
    const { index, start, end } = shot.steps[span];
    const drawn = curve.steps.findIndex((step) => step.index === index);
    const share = end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0;
    for (const key of Object.keys(series) as (keyof typeof series)[]) {
      const from = drawn < 0 ? null : sources[key][2 * drawn];
      const to = drawn < 0 ? null : sources[key][2 * drawn + 1];
      series[key].push(from === null || to === null ? null : from + (to - from) * share);
    }
  }
  return {
    t: shot.t,
    flow: median3(shot.flow),
    pressure: median3(shot.pressure),
    temperature: shot.temperature,
    ...series,
    borders: shot.steps.slice(1).map((step) => step.start),
    seconds: shot.seconds,
  };
}
