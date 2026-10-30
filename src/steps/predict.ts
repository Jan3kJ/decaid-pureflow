// A modelled shot: the profile's steps in, the flow, pressure
// and temperature a shot would show out. An approximation for one typical puck, not the
// user's coffee. Pure: no DOM and no Svelte.
//
// Each step drives one quantity, which follows its target through a first-order lag (one time
// constant for flow, one for pressure); a smooth step ramps the target from where the quantity
// is over the step's seconds. The coffee is a resistance R that grows (or falls) from a dry
// value to a wet one as water goes through: R = r1 + (r0 - r1) e^(-V / v0), V counted once the
// headspace above the puck is full (the export's fills run at the dry R until then). A flow step's
// pressure is R x flow, a pressure step's flow is pressure / R, and the step's limiter caps
// the quantity it does not drive. A step ends when its exit holds in the model (pressure or
// flow over or under, its weight, its volume) or at its seconds; the shot ends at the stop
// weight, else with its last step. The weight is the water pushed less what the puck keeps.
// The temperature starts off the first step's target and follows each step's target with a lag.
import type { Profile, ProfileStep } from '../api';
import type { StepSpan } from './curve';
import { num } from './model';
import { PUCK } from './puck';

/** The constants of one typical puck, fitted to the export by `scripts/shot-model-fit.mjs`. */
export interface Puck {
  /** bar per ml/s, the resistance of the dry puck */
  r0: number;
  /** bar per ml/s, the resistance of the wet puck */
  r1: number;
  /** ml, the water it takes to wet the puck (R has gone 63 percent of the way at v0) */
  v0: number;
  /** ml, the water that fills the space above the puck before any meets the coffee: V counts from there */
  headspace: number;
  /** s, the flow's time constant */
  flowLag: number;
  /** s, the pressure's time constant */
  pressureLag: number;
  /** ml, the water the puck keeps before the cup sees any */
  kept: number;
  /** °C, where the group sensor starts against the first step's target */
  temperatureOffset: number;
  /** s, the temperature's time constant */
  temperatureLag: number;
}

export interface PredictedShot {
  /** s, one sample per `PREDICT_STEP` from 0 */
  t: number[];
  /** ml/s */
  flow: number[];
  /** bar */
  pressure: number[];
  /** °C */
  temperature: number[];
  /** g in the cup; the model's, used for the exits and the stop, not drawn */
  weight: number[];
  /** the steps the model ran, with the moments they start and end; a step of 0 s or ended at once is left out */
  steps: StepSpan[];
  /** s, the end of the shot */
  seconds: number;
}

/** s, the model's time step */
export const PREDICT_STEP = 0.1;
/** ml/s, the most the pump gives whatever the puck */
const MAX_FLOW = 8;
/** s, a shot is never modelled longer */
const MAX_SECONDS = 180;
/** bar per ml/s, the least resistance the model takes, so a pressure step's flow stays finite */
const MIN_RESISTANCE = 0.05;

/** A step's limit on the quantity it does not drive, or null for none. */
function limitOf(step: ProfileStep): number | null {
  const value = num(step.limiter?.value);
  return value > 0 ? value : null;
}

/** The modelled shot of a profile with the puck's constants. */
export function predictShot(profile: Pick<Profile, 'steps' | 'target_weight'>, puck: Puck = PUCK): PredictedShot {
  const t = [0];
  const steps = profile.steps ?? [];
  const firstTemperature = num(steps.find((step) => num(step.seconds) > 0)?.temperature);
  let flow = 0;
  let pressure = 0;
  let volume = 0;
  let weight = 0;
  let temperature = firstTemperature + puck.temperatureOffset;
  const out = { flow: [flow], pressure: [pressure], temperature: [temperature], weight: [weight] };
  const spans: StepSpan[] = [];
  const stopWeight = num(profile.target_weight);
  const flowGain = 1 - Math.exp(-PREDICT_STEP / Math.max(puck.flowLag, 1e-3));
  const pressureGain = 1 - Math.exp(-PREDICT_STEP / Math.max(puck.pressureLag, 1e-3));
  const temperatureGain = 1 - Math.exp(-PREDICT_STEP / Math.max(puck.temperatureLag, 1e-3));
  // the samples are counted, so the clock does not drift from adding tenths
  const lastSample = Math.round(MAX_SECONDS / PREDICT_STEP);
  let sample = 0;
  let stopped = false;
  for (const [index, step] of steps.entries()) {
    const seconds = num(step.seconds);
    if (seconds <= 0) continue;
    const drivesFlow = step.pump !== 'pressure';
    const goal = drivesFlow ? num(step.flow) : num(step.pressure);
    const from = drivesFlow ? flow : pressure;
    const smooth = step.transition === 'smooth';
    const limit = limitOf(step);
    const exit = step.exit;
    const exitValue = num(exit?.value);
    const exitWeight = num(step.weight);
    const maxVolume = num(step.volume);
    const stepTemperature = num(step.temperature);
    const first = sample;
    const startVolume = volume;
    while ((sample - first) * PREDICT_STEP < seconds - 1e-9 && sample < lastSample) {
      sample += 1;
      const elapsed = (sample - first) * PREDICT_STEP;
      const target = smooth ? from + (goal - from) * Math.min(1, elapsed / seconds) : goal;
      const wetting = Math.max(0, volume - puck.headspace);
      const resistance = Math.max(MIN_RESISTANCE, puck.r1 + (puck.r0 - puck.r1) * Math.exp(-wetting / puck.v0));
      if (drivesFlow) {
        let wanted = Math.min(target, MAX_FLOW);
        if (limit !== null && wanted * resistance > limit) wanted = limit / resistance;
        flow += (wanted - flow) * flowGain;
        pressure = flow * resistance;
        if (limit !== null && pressure > limit) {
          pressure = limit;
          flow = limit / resistance;
        }
      } else {
        let wanted = target;
        const flowCap = Math.min(limit ?? MAX_FLOW, MAX_FLOW);
        if (wanted / resistance > flowCap) wanted = flowCap * resistance;
        pressure += (wanted - pressure) * pressureGain;
        flow = pressure / resistance;
        if (flow > flowCap) {
          flow = flowCap;
          pressure = flowCap * resistance;
        }
      }
      volume += flow * PREDICT_STEP;
      weight = Math.max(0, volume - puck.kept);
      temperature += (stepTemperature - temperature) * temperatureGain;
      t.push(sample * PREDICT_STEP);
      out.flow.push(flow);
      out.pressure.push(pressure);
      out.temperature.push(temperature);
      out.weight.push(weight);
      if (stopWeight > 0 && weight >= stopWeight) {
        stopped = true;
        break;
      }
      const quantity = exit?.type === 'pressure' ? pressure : flow;
      if (exit && (exit.condition === 'over' ? quantity > exitValue : quantity < exitValue)) break;
      if (exitWeight > 0 && weight >= exitWeight) break;
      if (maxVolume > 0 && volume - startVolume >= maxVolume) break;
    }
    if (sample > first) spans.push({ index, start: first * PREDICT_STEP, end: sample * PREDICT_STEP });
    if (stopped || sample >= lastSample) break;
  }
  return { t, ...out, steps: spans, seconds: sample * PREDICT_STEP };
}
