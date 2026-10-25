// The check of the shot model (research.md 'The shot model'): a recorded shot against the
// model and against the profile's targets as the step curve draws them. The fit script and
// the unit tests share it. Pure: no DOM.
import type { Profile } from '../api';
import { stepCurve, type StepCurve } from './curve';
import { predictShot, type PredictedShot, type Puck } from './predict';

/** A recorded shot: its profile and its measurements, one sample per entry of `t`. */
export interface RecordedShot {
  profile: Pick<Profile, 'title' | 'steps' | 'target_weight'>;
  /** s from the start of the shot */
  t: number[];
  flow: number[];
  pressure: number[];
  /** °C, the group sensor */
  temperature: number[];
  /** g, the scale */
  weight: number[];
}

export type Quantity = 'flow' | 'pressure' | 'temperature';
export const QUANTITIES: readonly Quantity[] = ['flow', 'pressure', 'temperature'];

/** Sums of absolute errors over the samples where the targets draw the quantity. */
export interface ErrorSum {
  model: number;
  target: number;
  count: number;
}

export interface ShotErrors {
  errors: Record<Quantity, ErrorSum>;
  /** per kind of step (`kindOf`), then per quantity */
  byKind: Map<string, Record<Quantity, ErrorSum>>;
  /** s */
  realSeconds: number;
  modelSeconds: number;
}

const emptySums = (): Record<Quantity, ErrorSum> => ({
  flow: { model: 0, target: 0, count: 0 },
  pressure: { model: 0, target: 0, count: 0 },
  temperature: { model: 0, target: 0, count: 0 },
});

/** The value the step curve draws at a time, or null where it draws none. */
export function drawnAt(curve: StepCurve, quantity: Quantity, time: number): number | null {
  const series = curve[quantity];
  for (let i = 0; i + 1 < curve.t.length; i += 2) {
    const start = curve.t[i];
    const end = curve.t[i + 1];
    if (time < start || time > end) continue;
    const a = series[i];
    const b = series[i + 1];
    if (a === null || b === null) return null;
    return end > start ? a + ((b - a) * (time - start)) / (end - start) : b;
  }
  return null;
}

/** The model's value at a time, linear between its samples and its last value after its end. */
export function modelAt(shot: PredictedShot, quantity: Quantity | 'weight', time: number): number {
  const series = shot[quantity];
  const step = shot.t[1] - shot.t[0] || 1;
  const at = time / step;
  const i = Math.floor(at);
  if (i >= series.length - 1) return series[series.length - 1];
  if (i < 0) return series[0];
  return series[i] + (series[i + 1] - series[i]) * (at - i);
}

/** One recorded shot's errors; `kindOf` names the kind of step a sample is in, by its index. */
export function shotErrors(shot: RecordedShot, puck?: Puck, kindOf?: (sample: number) => string): ShotErrors {
  const model = predictShot(shot.profile, puck);
  const curve = stepCurve(shot.profile);
  const errors = emptySums();
  const byKind = new Map<string, Record<Quantity, ErrorSum>>();
  for (const [i, time] of shot.t.entries()) {
    const kind = kindOf?.(i);
    let kindSums = kind === undefined ? undefined : byKind.get(kind);
    if (kind !== undefined && !kindSums) {
      kindSums = emptySums();
      byKind.set(kind, kindSums);
    }
    for (const quantity of QUANTITIES) {
      const target = drawnAt(curve, quantity, time);
      if (target === null) continue;
      const real = shot[quantity][i];
      for (const sums of kindSums ? [errors, kindSums] : [errors]) {
        sums[quantity].model += Math.abs(modelAt(model, quantity, time) - real);
        sums[quantity].target += Math.abs(target - real);
        sums[quantity].count += 1;
      }
    }
  }
  return { errors, byKind, realSeconds: shot.t[shot.t.length - 1], modelSeconds: model.seconds };
}

export interface CheckResult {
  /** mean absolute error over every sample of every shot */
  mae: Record<Quantity, { model: number; target: number }>;
  /** shots whose modelled length is within 20 percent of the real one */
  lengthWithin: number;
  shots: number;
  /** the acceptance: flow and pressure 40 percent below the targets, temperature not above, four lengths in five */
  passes: { flow: boolean; pressure: boolean; temperature: boolean; length: boolean };
}

/** Adds one shot's sums into a total. */
export function addSums(total: Record<Quantity, ErrorSum>, sums: Record<Quantity, ErrorSum>): void {
  for (const quantity of QUANTITIES) {
    total[quantity].model += sums[quantity].model;
    total[quantity].target += sums[quantity].target;
    total[quantity].count += sums[quantity].count;
  }
}

/** The mean absolute errors of a total. */
export function means(total: Record<Quantity, ErrorSum>): Record<Quantity, { model: number; target: number }> {
  const mean = (sum: ErrorSum) => ({
    model: sum.count ? sum.model / sum.count : 0,
    target: sum.count ? sum.target / sum.count : 0,
  });
  return { flow: mean(total.flow), pressure: mean(total.pressure), temperature: mean(total.temperature) };
}

/** Whether a modelled length is within 20 percent of the real one. */
export const lengthFits = (errors: Pick<ShotErrors, 'realSeconds' | 'modelSeconds'>): boolean =>
  Math.abs(errors.modelSeconds - errors.realSeconds) <= 0.2 * errors.realSeconds;

/** The check over shots the fit did not see. */
export function checkShots(shots: readonly RecordedShot[], puck?: Puck): CheckResult {
  const total = emptySums();
  let lengthWithin = 0;
  for (const shot of shots) {
    const result = shotErrors(shot, puck);
    addSums(total, result.errors);
    if (lengthFits(result)) lengthWithin += 1;
  }
  const mae = means(total);
  return {
    mae,
    lengthWithin,
    shots: shots.length,
    passes: {
      flow: mae.flow.model <= 0.6 * mae.flow.target,
      pressure: mae.pressure.model <= 0.6 * mae.pressure.target,
      temperature: mae.temperature.model <= mae.temperature.target,
      length: lengthWithin >= 0.8 * shots.length,
    },
  };
}
