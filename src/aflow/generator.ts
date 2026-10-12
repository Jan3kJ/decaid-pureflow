import * as C from './constants';
import type {
  AFlowParams,
  FlowStep,
  GenerateOptions,
  PressureStep,
  Profile,
  ProfileStep,
  StepExit,
} from './types';

// The plugin's round_to_one_digits; it also keeps 3 * 0.1 from becoming 0.30000000000000004.
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

interface StepValues {
  name: string;
  transition: 'fast' | 'smooth';
  temperature: number;
  seconds: number;
  weight?: number;
  exit?: StepExit;
  limiter: number;
}

function common(v: StepValues) {
  return {
    name: v.name,
    transition: v.transition,
    ...(v.exit ? { exit: v.exit } : {}),
    volume: C.STEP_VOLUME,
    seconds: v.seconds,
    weight: v.weight ?? 0,
    temperature: v.temperature,
    sensor: C.SENSOR,
    limiter: { value: v.limiter, range: C.LIMITER_RANGE },
  } as const;
}

function flowStep(flow: number, v: StepValues): FlowStep {
  return { ...common(v), pump: 'flow', flow };
}

function pressureStep(pressure: number, v: StepValues): PressureStep {
  return { ...common(v), pump: 'pressure', pressure };
}

/** The steps of spec 3.2, items 0 to 7. A step that is off is not in the list. */
export function generateSteps(p: AFlowParams, firstStepWorkaround = false): ProfileStep[] {
  const steps: ProfileStep[] = [];

  if (firstStepWorkaround) {
    steps.push(
      flowStep(C.PRE_FILL_FLOW, {
        name: C.STEP_NAME.preFill,
        transition: 'fast',
        temperature: p.fillTemperature,
        seconds: C.PRE_FILL_SECONDS,
        limiter: C.PRE_FILL_PRESSURE_LIMIT,
      }),
    );
  }

  steps.push(
    flowStep(p.fillFlow, {
      name: C.STEP_NAME.fill,
      transition: 'fast',
      temperature: p.fillTemperature,
      seconds: C.FILL_SECONDS,
      exit: { type: 'pressure', condition: 'over', value: C.FILL_EXIT_PRESSURE_OVER },
      limiter: C.FILL_PRESSURE_LIMIT,
    }),
    pressureStep(p.infusePressure, {
      name: C.STEP_NAME.infuse,
      transition: 'fast',
      temperature: p.fillTemperature,
      seconds: p.infuseTime,
      weight: p.infuseWeight,
      limiter: C.INFUSE_FLOW_LIMIT,
    }),
  );

  if (p.secondFill) {
    steps.push(
      flowStep(p.secondFillFlow, {
        name: C.STEP_NAME.secondFill,
        transition: 'fast',
        temperature: p.fillTemperature,
        seconds: C.SECOND_FILL_SECONDS,
        exit: { type: 'pressure', condition: 'over', value: C.SECOND_FILL_EXIT_PRESSURE_OVER },
        limiter: C.SECOND_FILL_PRESSURE_LIMIT,
      }),
      pressureStep(C.PAUSE_PRESSURE, {
        name: C.STEP_NAME.pause,
        transition: 'fast',
        temperature: p.fillTemperature,
        seconds: p.pauseDuration,
        exit: { type: 'flow', condition: 'under', value: C.PAUSE_EXIT_FLOW_UNDER },
        limiter: C.PAUSE_FLOW_LIMIT,
      }),
    );
  }

  steps.push(
    pressureStep(p.pourPressure, {
      name: C.STEP_NAME.rampUp,
      transition: 'smooth',
      temperature: p.pourTemperature,
      seconds: p.rampTime,
      exit: { type: 'flow', condition: 'over', value: round1(p.pourFlow) },
      limiter: C.NO_LIMITER,
    }),
  );

  if (p.rampTime < C.RAMP_TIME_MIN) {
    // Without a ramp, this step brings the flow to its target fast.
    steps.push(
      flowStep(p.pourFlow, {
        name: C.STEP_NAME.pouringStart,
        transition: 'fast',
        temperature: p.pourTemperature,
        seconds: C.POURING_START_SECONDS,
        exit: {
          type: 'flow',
          condition: 'over',
          value: round1(p.pourFlow - C.POURING_START_EXIT_MARGIN),
        },
        limiter: C.NO_LIMITER,
      }),
    );
  }

  steps.push(
    flowStep(p.flowUp ? round1(p.pourFlow * C.FLOW_UP_FACTOR) : C.FLOW_DOWN_TARGET, {
      name: C.STEP_NAME.pouring,
      transition: 'smooth',
      temperature: p.pourTemperature,
      seconds: C.POURING_SECONDS,
      limiter: p.pourPressure,
    }),
  );

  return steps;
}

/** A-Flow 3.0 parameters in, a Decaid v2 profile out. It does not validate: see validateParams. */
export function generateProfile(p: AFlowParams, options: GenerateOptions): Profile {
  return {
    version: C.PROFILE_VERSION,
    title: options.title,
    author: options.author ?? '',
    notes: options.notes ?? '',
    beverage_type: C.BEVERAGE_TYPE,
    steps: generateSteps(p, options.firstStepWorkaround ?? false),
    tank_temperature: C.TANK_TEMPERATURE,
    target_weight: p.stopWeight,
    target_volume: C.TARGET_VOLUME,
    target_volume_count_start: C.TARGET_VOLUME_COUNT_START,
  };
}
