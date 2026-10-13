import * as C from './constants';
import type {
  AFlowParams,
  FlowStep,
  GenerateOptions,
  PressureStep,
  Profile,
  ProfileStep,
  ResolvedParams,
  StepExit,
} from './types';

// The plugin's round_to_one_digits; it also keeps 3 * 0.1 from becoming 0.30000000000000004.
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The 2nd fill and its pause are on when the pause lasts longer than 0 s. */
export function hasSecondFill(p: Pick<AFlowParams, 'pauseDuration'>): boolean {
  return p.pauseDuration > 0;
}

/**
 * Fills in every value that is null, the one place that says what follows what: the infuse
 * temperature follows the fill temperature, the 2nd fill temperature the infuse temperature,
 * the ramp temperature the pour temperature, the pressure limit of the pour the pour
 * pressure, and the end flow the toggle (2 x pour flow with flow up, 0 with flow down).
 */
export function resolveParams(p: AFlowParams): ResolvedParams {
  const infuseTemperature = p.infuseTemperature ?? p.fillTemperature;
  return {
    ...p,
    infuseTemperature,
    secondFillTemperature: p.secondFillTemperature ?? infuseTemperature,
    rampTemperature: p.rampTemperature ?? p.pourTemperature,
    pourEndFlow:
      p.pourEndFlow ?? (p.flowUp ? round1(p.pourFlow * C.FLOW_UP_FACTOR) : C.FLOW_DOWN_TARGET),
    pourPressureLimit: p.pourPressureLimit ?? p.pourPressure,
  };
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
export function generateSteps(params: AFlowParams, firstStepWorkaround = false): ProfileStep[] {
  const p = resolveParams(params);
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
      seconds: p.fillTime,
      exit: { type: 'pressure', condition: 'over', value: p.fillExitPressure },
      limiter: C.FILL_PRESSURE_LIMIT,
    }),
    pressureStep(p.infusePressure, {
      name: C.STEP_NAME.infuse,
      transition: 'fast',
      temperature: p.infuseTemperature,
      seconds: p.infuseTime,
      weight: p.infuseWeight,
      limiter: p.infuseFlowLimit,
    }),
  );

  if (hasSecondFill(p)) {
    steps.push(
      flowStep(p.secondFillFlow, {
        name: C.STEP_NAME.secondFill,
        transition: 'fast',
        temperature: p.secondFillTemperature,
        seconds: p.secondFillTime,
        exit: { type: 'pressure', condition: 'over', value: p.secondFillExitPressure },
        limiter: C.SECOND_FILL_PRESSURE_LIMIT,
      }),
      pressureStep(C.PAUSE_PRESSURE, {
        name: C.STEP_NAME.pause,
        transition: 'fast',
        temperature: p.secondFillTemperature,
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
      temperature: p.rampTemperature,
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
    flowStep(p.pourEndFlow, {
      name: C.STEP_NAME.pouring,
      transition: 'smooth',
      temperature: p.pourTemperature,
      seconds: p.pourTime,
      limiter: p.pourPressureLimit,
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
