// The editor's graph as data: A-Flow parameters in, the points of the three lines and the
// phase borders out. It is a schematic of the profile, not a simulation of a shot: the levels
// are the parameters, what happens between them is drawn from the generator's constants.
// No DOM and no Svelte here.
import {
  DEFAULT_MACHINE_LIMITS,
  hasSecondFill,
  type AFlowParams,
  type MachineLimits,
  type NumberField,
} from '../aflow';
import {
  FILL_EXIT_PRESSURE_OVER,
  FLOW_DOWN_TARGET,
  FLOW_UP_FACTOR,
  INFUSE_FLOW_LIMIT,
  PAUSE_FLOW_LIMIT,
  PAUSE_PRESSURE,
  SECOND_FILL_EXIT_PRESSURE_OVER,
} from '../aflow/constants';

export type PhaseId = 'fill' | 'infuse' | 'secondFill' | 'pressurize' | 'flow';
export type LineId = 'flow' | 'pressure' | 'temperature';

export const PHASE_LABEL: Record<PhaseId, string> = {
  fill: 'fill',
  infuse: 'infuse',
  secondFill: '2nd fill',
  pressurize: 'pressurize',
  flow: 'flow',
};

/** x is in graph units, 0 to GRAPH_WIDTH; y is in the line's own unit (ml/s, bar or °C). */
export interface Point {
  x: number;
  y: number;
}

export interface PhaseColumn {
  id: PhaseId;
  x0: number;
  x1: number;
}

/** A phase border that can be dragged: it changes a duration. */
export interface Border {
  x: number;
  field: NumberField;
  /** the phase on its left, whose duration it is */
  phase: PhaseId;
}

/** A stretch of a line that can be dragged up or down: it changes one value. */
export interface Level {
  line: LineId;
  field: NumberField;
  phase: PhaseId;
  from: Point;
  to: Point;
}

export interface Curve {
  phases: PhaseColumn[];
  borders: Border[];
  levels: Level[];
  flow: Point[];
  pressure: Point[];
  temperature: Point[];
  /** where the pause begins inside the 2nd fill column; only with the 2nd fill on */
  pauseX?: number;
  /** under 1 when long durations made the columns shrink to fit */
  scale: number;
}

export const GRAPH_WIDTH = 100;

// Column widths in graph units. The fill and the pour have no editable duration and get a
// fixed share; a phase with a duration gets a minimum plus its compressed seconds.
const FILL_UNITS = 10;
const SECOND_FILL_UNITS = 8;
const DURATION_MIN_UNITS = 8;
const PAUSE_MIN_UNITS = 4;
const POUR_MIN_UNITS = 18;

// Seconds are drawn 1:1 up to 10 s, then compressed, so that 60 s of infusion and 5 s of
// ramp are both draggable on one screen and 1000 s still fits.
const LINEAR_SECONDS = 10;
const MID_SECONDS = 60;
const MID_SLOPE = 0.3;
const LONG_SLOPE = 0.01;
const MID_UNITS = LINEAR_SECONDS + (MID_SECONDS - LINEAR_SECONDS) * MID_SLOPE;

/** ml/s; where the flow line ends in a phase that holds pressure */
const SOAK_FLOW = 0.2;
/** The pour is drawn this far on its 60 s way to the generator's flow target. */
const POUR_SHOWN = 0.5;

/** The width a duration adds to its column. */
export function secondsToUnits(seconds: number): number {
  const s = Math.max(0, seconds);
  if (s <= LINEAR_SECONDS) return s;
  if (s <= MID_SECONDS) return LINEAR_SECONDS + (s - LINEAR_SECONDS) * MID_SLOPE;
  return MID_UNITS + (s - MID_SECONDS) * LONG_SLOPE;
}

/** The inverse of secondsToUnits, for a border that is dragged. */
export function unitsToSeconds(units: number): number {
  const u = Math.max(0, units);
  if (u <= LINEAR_SECONDS) return u;
  if (u <= MID_UNITS) return LINEAR_SECONDS + (u - LINEAR_SECONDS) / MID_SLOPE;
  return MID_SECONDS + (u - MID_UNITS) / LONG_SLOPE;
}

export function buildCurve(p: AFlowParams, limits: MachineLimits = DEFAULT_MACHINE_LIMITS): Curve {
  const widths: [PhaseId, number][] = [
    ['fill', FILL_UNITS],
    ['infuse', DURATION_MIN_UNITS + secondsToUnits(p.infuseTime)],
  ];
  if (hasSecondFill(p)) {
    widths.push([
      'secondFill',
      SECOND_FILL_UNITS + PAUSE_MIN_UNITS + secondsToUnits(p.pauseDuration),
    ]);
  }
  widths.push(['pressurize', DURATION_MIN_UNITS + secondsToUnits(p.rampTime)]);

  const used = widths.reduce((sum, [, w]) => sum + w, 0);
  const scale = Math.min(1, GRAPH_WIDTH / (used + POUR_MIN_UNITS));

  const phases: PhaseColumn[] = [];
  let x = 0;
  for (const [id, w] of widths) {
    phases.push({ id, x0: x, x1: x + w * scale });
    x += w * scale;
  }
  phases.push({ id: 'flow', x0: x, x1: GRAPH_WIDTH });

  const col = (id: PhaseId) => phases.find((c) => c.id === id)!;
  const fill = col('fill');
  const infuse = col('infuse');
  const pressurize = col('pressurize');
  const pour = col('flow');

  const flow: Point[] = [];
  const pressure: Point[] = [];
  const levels: Level[] = [];
  const borders: Border[] = [];
  const level = (line: LineId, field: NumberField, phase: PhaseId, from: Point, to: Point) =>
    levels.push({ line, field, phase, from, to });

  // Fill: flow at its target, the pressure builds to the step's exit.
  flow.push({ x: fill.x0, y: p.fillFlow }, { x: fill.x1, y: p.fillFlow });
  pressure.push({ x: fill.x0, y: 0 }, { x: fill.x1, y: FILL_EXIT_PRESSURE_OVER });
  level('flow', 'fillFlow', 'fill', flow[0], flow[1]);

  // Infuse: pressure at its target, the flow falls under the limiter as the puck soaks.
  pressure.push({ x: infuse.x0, y: p.infusePressure }, { x: infuse.x1, y: p.infusePressure });
  flow.push(
    { x: infuse.x0, y: Math.min(p.fillFlow, INFUSE_FLOW_LIMIT) },
    { x: infuse.x1, y: SOAK_FLOW },
  );
  level('pressure', 'infusePressure', 'infuse', pressure[2], pressure[3]);
  borders.push({ x: infuse.x1, field: 'infuseTime', phase: 'infuse' });

  let pauseX: number | undefined;
  let rampFrom = p.infusePressure;
  if (hasSecondFill(p)) {
    const second = col('secondFill');
    pauseX = second.x0 + SECOND_FILL_UNITS * scale;
    const from = { x: second.x0, y: p.secondFillFlow };
    const to = { x: pauseX, y: p.secondFillFlow };
    flow.push(
      from,
      to,
      { x: pauseX, y: Math.min(p.secondFillFlow, PAUSE_FLOW_LIMIT) },
      { x: second.x1, y: SOAK_FLOW },
    );
    pressure.push(
      { x: pauseX, y: SECOND_FILL_EXIT_PRESSURE_OVER },
      { x: pauseX, y: PAUSE_PRESSURE },
      { x: second.x1, y: PAUSE_PRESSURE },
    );
    level('flow', 'secondFillFlow', 'secondFill', from, to);
    borders.push({ x: second.x1, field: 'pauseDuration', phase: 'secondFill' });
    rampFrom = PAUSE_PRESSURE;
  }

  // Pressurize: the pressure ramps to the pour pressure; the step ends when the flow is over
  // the pour flow.
  pressure.push({ x: pressurize.x0, y: rampFrom }, { x: pressurize.x1, y: p.pourPressure });
  flow.push({ x: pressurize.x1, y: p.pourFlow });
  borders.push({ x: pressurize.x1, field: 'rampTime', phase: 'pressurize' });

  // Flow: the flow moves slowly toward the generator's target (2 x pour flow, or 0), held
  // under the pour pressure.
  const target = p.flowUp ? p.pourFlow * FLOW_UP_FACTOR : FLOW_DOWN_TARGET;
  const pourEnd = Math.min(limits.maxFlow, p.pourFlow + (target - p.pourFlow) * POUR_SHOWN);
  const pourFrom = { x: pour.x0, y: p.pourFlow };
  const pourTo = { x: pour.x1, y: pourEnd };
  flow.push(pourTo);
  const pressureFrom = { x: pour.x0, y: p.pourPressure };
  const pressureTo = { x: pour.x1, y: p.pourPressure };
  pressure.push(pressureTo);
  level('flow', 'pourFlow', 'flow', pourFrom, pourTo);
  level('pressure', 'pourPressure', 'flow', pressureFrom, pressureTo);

  // Temperature: one value up to the ramp, one from there on.
  const temperature: Point[] = [
    { x: 0, y: p.fillTemperature },
    { x: pressurize.x0, y: p.fillTemperature },
    { x: pressurize.x0, y: p.pourTemperature },
    { x: GRAPH_WIDTH, y: p.pourTemperature },
  ];
  level('temperature', 'fillTemperature', 'fill', temperature[0], temperature[1]);
  level('temperature', 'pourTemperature', 'flow', temperature[2], temperature[3]);

  return { phases, borders, levels, flow, pressure, temperature, pauseX, scale };
}

/** How graph units and values land on the screen, in pixels. */
export interface Projection {
  x(units: number): number;
  y(line: LineId, value: number): number;
}

export type Hit = { kind: 'level'; level: Level } | { kind: 'border'; border: Border };

/**
 * What a finger at (px, py) takes hold of: the nearest level line within `levelReach` pixels
 * above or below it, or the nearest phase border within `borderReach` pixels left or right.
 * The nearer of the two wins.
 */
export function hitTest(
  curve: Curve,
  px: number,
  py: number,
  projection: Projection,
  levelReach: number,
  borderReach: number,
): Hit | null {
  let best: Hit | null = null;
  let bestDistance = Infinity;

  for (const level of curve.levels) {
    const x0 = projection.x(level.from.x);
    const x1 = projection.x(level.to.x);
    if (px < x0 || px > x1 || x1 === x0) continue;
    const t = (px - x0) / (x1 - x0);
    const value = level.from.y + (level.to.y - level.from.y) * t;
    const distance = Math.abs(py - projection.y(level.line, value));
    if (distance <= levelReach && distance < bestDistance) {
      best = { kind: 'level', level };
      bestDistance = distance;
    }
  }

  for (const border of curve.borders) {
    const distance = Math.abs(px - projection.x(border.x));
    if (distance <= borderReach && distance < bestDistance) {
      best = { kind: 'border', border };
      bestDistance = distance;
    }
  }

  return best;
}
