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
// the quantity it does not drive. Where the pump does not drive the pressure it moves by
// PRESSURE_RATE at most (the resistance climbs within a few ml once the headspace is full, faster
// than a pump builds pressure), and the flow falls by FLOW_FALL at most.
// While the pump pushes less (a flow step's target below the flow, a pressure step's target or its
// limiter's flow x R below the pressure) the puck holds its pressure and lets it go with the water
// that leaves through it: the pressure falls towards R x flow (or the step's lower target) through
// its own, slower lag (`releaseLag`; a smooth step's through the pressure's lag, as the machine
// walks its target down), and the flow falls through its lag to the step's low value. Neither
// rises then, so a resistance that still grows as the puck wets raises nothing; the water the pump
// pushes over pressure / R fills the space above the puck and does not reach the cup. A step ends
// when its exit holds in the model (pressure or flow over or under, its weight, its volume) or at
// its seconds; the shot ends at the stop weight, else with its last step. The weight is the water
// through the puck less what the puck keeps.
// The temperature starts off the first step's target and follows each step's target with a lag.
import type { Profile } from '../api';
import type { StepSpan } from './curve';
import { num, stepLimit } from './model';
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
  /** s, the time constant of the pressure the puck lets go while the pump pushes less (chosen, not fitted) */
  releaseLag: number;
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
/** bar/s, the fastest the pressure moves where the pump does not drive it, however fast R climbs or a limiter cuts in */
const PRESSURE_RATE = 5;
/** ml/s or bar, a driven quantity this close above its target is held there, not falling; not on a smooth step's ramp */
const SETTLED = 0.05;
/** ml/s per s, the fastest the flow falls when the pump pushes less */
const FLOW_FALL = 5;
/** bar per ml/s, the least resistance the model takes, so a pressure step's flow stays finite */
const MIN_RESISTANCE = 0.05;

/** The modelled shot of a profile with the puck's constants. */
export function predictShot(profile: Pick<Profile, 'steps' | 'target_weight'>, puck: Puck = PUCK): PredictedShot {
  const t = [0];
  const steps = profile.steps ?? [];
  const firstTemperature = num(steps.find((step) => num(step.seconds) > 0)?.temperature);
  let flow = 0;
  let pressure = 0;
  let volume = 0;
  // ml through the puck: the pump's water less what fills the space above it while it holds its pressure
  let passed = 0;
  let weight = 0;
  let temperature = firstTemperature + puck.temperatureOffset;
  const out = { flow: [flow], pressure: [pressure], temperature: [temperature], weight: [weight] };
  const spans: StepSpan[] = [];
  const stopWeight = num(profile.target_weight);
  const flowGain = 1 - Math.exp(-PREDICT_STEP / Math.max(puck.flowLag, 1e-3));
  const pressureGain = 1 - Math.exp(-PREDICT_STEP / Math.max(puck.pressureLag, 1e-3));
  const releaseGain = 1 - Math.exp(-PREDICT_STEP / Math.max(puck.releaseLag, 1e-3));
  const temperatureGain = 1 - Math.exp(-PREDICT_STEP / Math.max(puck.temperatureLag, 1e-3));
  // the samples are counted, so the clock does not drift from adding tenths
  const lastSample = Math.round(MAX_SECONDS / PREDICT_STEP);
  let sample = 0;
  let stopped = false;
  // false where the pressure is not flow x R: a release or PRESSURE_RATE held it off
  let onResistance = true;
  for (const [index, step] of steps.entries()) {
    const seconds = num(step.seconds);
    if (seconds <= 0) continue;
    const drivesFlow = step.pump !== 'pressure';
    const goal = drivesFlow ? num(step.flow) : num(step.pressure);
    const from = drivesFlow ? flow : pressure;
    const smooth = step.transition === 'smooth';
    const limit = stepLimit(step);
    const exit = step.exit;
    const exitValue = num(exit?.value);
    const exitWeight = num(step.weight);
    const maxVolume = num(step.volume);
    const stepTemperature = num(step.temperature);
    const first = sample;
    const startVolume = volume;
    // a smooth step walks the machine's target down, which the pressure follows with its own lag
    const letGo = smooth ? pressureGain : releaseGain;
    /** the pressure the puck lets go towards a lower value in one sample */
    const released = (value: number, to: number) => Math.max(value + (to - value) * letGo, value - PRESSURE_RATE * PREDICT_STEP);
    while ((sample - first) * PREDICT_STEP < seconds - 1e-9 && sample < lastSample) {
      sample += 1;
      const elapsed = (sample - first) * PREDICT_STEP;
      const ramping = smooth && elapsed < seconds;
      const target = ramping ? from + ((goal - from) * elapsed) / seconds : goal;
      const wetting = Math.max(0, volume - puck.headspace);
      const resistance = Math.max(MIN_RESISTANCE, puck.r1 + (puck.r0 - puck.r1) * Math.exp(-wetting / puck.v0));
      const before = pressure;
      if (drivesFlow) {
        let wanted = Math.min(target, MAX_FLOW);
        if (limit !== null && wanted * resistance > limit) wanted = limit / resistance;
        if (wanted < flow - (ramping ? 0 : SETTLED)) {
          flow = Math.max(wanted, flow - FLOW_FALL * PREDICT_STEP, flow + (wanted - flow) * flowGain);
          pressure = Math.min(pressure, released(pressure, flow * resistance));
        } else {
          flow += (wanted - flow) * flowGain;
          const held = flow * resistance;
          pressure = held > pressure ? Math.min(held, pressure + PRESSURE_RATE * PREDICT_STEP) : released(pressure, held);
        }
        if (limit !== null && pressure > limit) {
          pressure = Math.max(limit, before - PRESSURE_RATE * PREDICT_STEP);
          flow = Math.min(flow, Math.max(pressure / resistance, flow - FLOW_FALL * PREDICT_STEP));
        }
      } else {
        let wanted = target;
        const flowCap = Math.min(limit ?? MAX_FLOW, MAX_FLOW);
        if (wanted / resistance > flowCap) wanted = flowCap * resistance;
        if (wanted < pressure - (ramping ? 0 : SETTLED)) {
          pressure = released(pressure, wanted);
          const through = Math.min(pressure / resistance, flowCap);
          flow = Math.min(flow, Math.max(through, flow - FLOW_FALL * PREDICT_STEP, flow + (through - flow) * flowGain));
        } else {
          pressure += (wanted - pressure) * pressureGain;
          const through = pressure / resistance;
          // a flow a release left above pressure / R comes down to it through its lag
          flow =
            onResistance || through >= flow
              ? through
              : Math.max(through, flow - FLOW_FALL * PREDICT_STEP, flow + (through - flow) * flowGain);
          if (flow > flowCap) {
            flow = flowCap;
            pressure = flowCap * resistance;
          }
        }
      }
      onResistance = Math.abs(pressure - flow * resistance) < 1e-9;
      volume += flow * PREDICT_STEP;
      passed += Math.min(flow, pressure / resistance) * PREDICT_STEP;
      weight = Math.max(0, passed - puck.kept);
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
