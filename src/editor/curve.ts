// The editor's graph as data: A-Flow parameters in, the points of the three lines and the
// phase borders out. It is a schematic of the profile, not a simulation of a shot: the levels
// are the parameters, what happens between them is drawn from the generator's constants.
// No DOM and no Svelte here.
import {
  DEFAULT_MACHINE_LIMITS,
  FLOW_MIN,
  hasSecondFill,
  resolveParams,
  type AFlowParams,
  type FollowField,
  type MachineLimits,
  type NumberField,
} from '../aflow';
import { PAUSE_FLOW_LIMIT, PAUSE_PRESSURE } from '../aflow/constants';

export type PhaseId = 'fill' | 'infuse' | 'secondFill' | 'pressurize' | 'flow';
export type LineId = 'flow' | 'pressure' | 'temperature';
/** Every value the editor shows: one that is always a number, or one that may follow another. */
export type EditField = NumberField | FollowField;

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
  /** how many seconds of the duration one graph unit to the right adds */
  secondsPerUnit: number;
  /** dragged in detail mode only (the pause, founder 2026-10-12) */
  detailOnly: boolean;
}

/** A stretch of a line that can be dragged up or down. */
export interface Level {
  line: LineId;
  /** the value the stretch is drawn at; each value has one stretch */
  field: EditField;
  /**
   * the value a drag changes. It is `field`, except for the temperatures: a phase's
   * temperature line moves its whole group (edit.ts, TEMPERATURE_GROUPS)
   */
  drags: NumberField;
  phase: PhaseId;
  from: Point;
  to: Point;
  /** where the value is written: over the middle, at the left end, or not at all */
  label: 'middle' | 'start' | 'none';
}

export interface Curve {
  phases: PhaseColumn[];
  borders: Border[];
  levels: Level[];
  /** the stretches of the flow line; it is not drawn during the infuse phase */
  flow: Point[][];
  pressure: Point[];
  temperature: Point[];
  /** the pour's pressure limiter, only where it is not the pour pressure itself */
  pressureLimit?: [Point, Point];
  /** where the pause begins inside the 2nd fill column; only with the 2nd fill on */
  pauseX?: number;
}

export const GRAPH_WIDTH = 100;

// The time axis. The graph shows AXIS_SECONDS, or more when the set times need more; the flow
// phase takes what the other phases leave. A column never gets narrower than its minimum, so
// that a finger can still take hold of what is in it (8 units are 96 px of a 1200 px graph).
/** s; the length of a shot the graph shows when the set times are shorter */
export const AXIS_SECONDS = 60;
export const MIN_COLUMN_UNITS = 8;
export const PAUSE_MIN_UNITS = 4;
export const FLOW_MIN_UNITS = 20;

// A fill ends on its move-on pressure long before its time limit: it lasts as long as the
// pump needs for the water that fits above and into the puck (3 to 4 s at 8 ml/s).
/** ml; 3.5 s at 8 ml/s */
const FILL_VOLUME = 28;
/** ml; the puck is wet already: 2 s at 8 ml/s */
const SECOND_FILL_VOLUME = 16;
/** A pause ends on its flow exit: it is drawn at this share of its time limit. */
const PAUSE_SHOWN = 0.1;

/** ml/s; where the flow line ends in a phase that holds pressure */
const SOAK_FLOW = 0.2;
/** s; a pour ends on its weight: the flow line is drawn this far into the pour's time */
const POUR_SHOWN_SECONDS = 30;

export interface TimeAxis {
  /** the width of each column in graph units; together they are GRAPH_WIDTH */
  widths: Partial<Record<PhaseId, number>>;
  /** the part of the 2nd fill column that is the pause; 0 without a 2nd fill */
  pauseWidth: number;
  /** how wide one second is drawn in a column that is not at its minimum width */
  unitsPerSecond: number;
}

/** The seconds each phase is expected to take, from its parameters. */
export function expectedSeconds(p: AFlowParams): {
  fill: number;
  infuse: number;
  secondFill: number;
  pause: number;
  pressurize: number;
} {
  const pumping = (volume: number, flow: number, limit: number) =>
    Math.max(0, Math.min(limit, volume / Math.max(flow, FLOW_MIN)));
  const second = hasSecondFill(p);
  return {
    fill: pumping(FILL_VOLUME, p.fillFlow, p.fillTime),
    infuse: Math.max(0, p.infuseTime),
    secondFill: second ? pumping(SECOND_FILL_VOLUME, p.secondFillFlow, p.secondFillTime) : 0,
    pause: second ? p.pauseDuration * PAUSE_SHOWN : 0,
    pressurize: Math.max(0, p.rampTime),
  };
}

/**
 * The widths of the columns: every phase as wide as its expected seconds on one linear scale,
 * the flow phase with the rest of AXIS_SECONDS, and none under its minimum width.
 */
export function timeAxis(p: AFlowParams): TimeAxis {
  const seconds = expectedSeconds(p);
  type Part = { id: PhaseId | 'pause'; seconds: number; min: number };
  const parts: Part[] = [
    { id: 'fill', seconds: seconds.fill, min: MIN_COLUMN_UNITS },
    { id: 'infuse', seconds: seconds.infuse, min: MIN_COLUMN_UNITS },
  ];
  if (hasSecondFill(p)) {
    parts.push(
      { id: 'secondFill', seconds: seconds.secondFill, min: MIN_COLUMN_UNITS },
      { id: 'pause', seconds: seconds.pause, min: PAUSE_MIN_UNITS },
    );
  }
  parts.push({ id: 'pressurize', seconds: seconds.pressurize, min: MIN_COLUMN_UNITS });
  const timed = parts.reduce((sum, part) => sum + part.seconds, 0);
  parts.push({ id: 'flow', seconds: Math.max(0, AXIS_SECONDS - timed), min: FLOW_MIN_UNITS });

  // Columns that would be under their minimum get it; the others share what is left. Each
  // round can only lower the scale, so a column that got its minimum keeps it.
  const atMin = new Set<Part>();
  let unitsPerSecond = GRAPH_WIDTH / AXIS_SECONDS;
  for (;;) {
    const free = parts.filter((part) => !atMin.has(part));
    const room = GRAPH_WIDTH - [...atMin].reduce((sum, part) => sum + part.min, 0);
    const freeSeconds = free.reduce((sum, part) => sum + part.seconds, 0);
    if (freeSeconds <= 0) {
      free.forEach((part) => atMin.add(part));
      break;
    }
    unitsPerSecond = room / freeSeconds;
    const small = free.filter((part) => part.seconds * unitsPerSecond < part.min);
    if (small.length === 0) break;
    small.forEach((part) => atMin.add(part));
  }

  const width = (part: Part) => (atMin.has(part) ? part.min : part.seconds * unitsPerSecond);
  const widths: Partial<Record<PhaseId, number>> = {};
  let pauseWidth = 0;
  let used = 0;
  for (const part of parts) {
    const w = width(part);
    used += w;
    if (part.id === 'pause') {
      pauseWidth = w;
      widths.secondFill = (widths.secondFill ?? 0) + w;
    } else {
      widths[part.id] = (widths[part.id] ?? 0) + w;
    }
  }
  // Only when every column is at its minimum is there anything left: the flow phase takes it.
  widths.flow = (widths.flow ?? 0) + (GRAPH_WIDTH - used);
  return { widths, pauseWidth, unitsPerSecond };
}

export function buildCurve(
  params: AFlowParams,
  limits: MachineLimits = DEFAULT_MACHINE_LIMITS,
): Curve {
  const p = resolveParams(params);
  const axis = timeAxis(params);
  const second = hasSecondFill(params);

  const order: PhaseId[] = second
    ? ['fill', 'infuse', 'secondFill', 'pressurize', 'flow']
    : ['fill', 'infuse', 'pressurize', 'flow'];
  const phases: PhaseColumn[] = [];
  let x = 0;
  for (const id of order) {
    const x1 = id === 'flow' ? GRAPH_WIDTH : x + axis.widths[id]!;
    phases.push({ id, x0: x, x1 });
    x = x1;
  }

  const col = (id: PhaseId) => phases.find((c) => c.id === id)!;
  const fill = col('fill');
  const infuse = col('infuse');
  const pressurize = col('pressurize');
  const pour = col('flow');

  const pressure: Point[] = [];
  const levels: Level[] = [];
  const borders: Border[] = [];
  const level = (
    line: LineId,
    field: EditField,
    phase: PhaseId,
    from: Point,
    to: Point,
    label: Level['label'] = 'middle',
    drags: NumberField = field as NumberField,
  ) => levels.push({ line, field, drags, phase, from, to, label });
  const secondsPerUnit = 1 / axis.unitsPerSecond;

  // Fill: flow at its target, the pressure builds to the step's exit.
  const fillFlow: Point[] = [
    { x: fill.x0, y: p.fillFlow },
    { x: fill.x1, y: p.fillFlow },
  ];
  pressure.push({ x: fill.x0, y: 0 }, { x: fill.x1, y: p.fillExitPressure });
  level('flow', 'fillFlow', 'fill', fillFlow[0], fillFlow[1]);

  // Infuse: pressure at its target. The flow is whatever the puck takes under the limiter,
  // so its line is not drawn here (founder, 2026-10-12).
  pressure.push({ x: infuse.x0, y: p.infusePressure }, { x: infuse.x1, y: p.infusePressure });
  level('pressure', 'infusePressure', 'infuse', pressure[2], pressure[3]);
  borders.push({
    x: infuse.x1,
    field: 'infuseTime',
    phase: 'infuse',
    secondsPerUnit,
    detailOnly: false,
  });

  // The flow line starts again after the infusion.
  const laterFlow: Point[] = [];
  let pauseX: number | undefined;
  let rampFrom = p.infusePressure;
  if (second) {
    const column = col('secondFill');
    pauseX = column.x1 - axis.pauseWidth;
    const from = { x: column.x0, y: p.secondFillFlow };
    const to = { x: pauseX, y: p.secondFillFlow };
    laterFlow.push(
      from,
      to,
      { x: pauseX, y: Math.min(p.secondFillFlow, PAUSE_FLOW_LIMIT) },
      { x: column.x1, y: SOAK_FLOW },
    );
    pressure.push(
      { x: pauseX, y: p.secondFillExitPressure },
      { x: pauseX, y: PAUSE_PRESSURE },
      { x: column.x1, y: PAUSE_PRESSURE },
    );
    level('flow', 'secondFillFlow', 'secondFill', from, to);
    borders.push({
      x: column.x1,
      field: 'pauseDuration',
      phase: 'secondFill',
      secondsPerUnit: secondsPerUnit / PAUSE_SHOWN,
      detailOnly: true,
    });
    rampFrom = PAUSE_PRESSURE;
  } else {
    laterFlow.push({ x: pressurize.x0, y: SOAK_FLOW });
  }

  // Pressurize: the pressure ramps to its target; the step ends when the flow is over the
  // start flow.
  pressure.push({ x: pressurize.x0, y: rampFrom }, { x: pressurize.x1, y: p.pourPressure });
  borders.push({
    x: pressurize.x1,
    field: 'rampTime',
    phase: 'pressurize',
    secondsPerUnit,
    detailOnly: false,
  });

  // Flow: the flow moves from the start flow toward its end flow over the flow time; the
  // shot stops on its weight before that, so only the first part of the way is drawn.
  const shown = p.pourTime > 0 ? Math.min(1, POUR_SHOWN_SECONDS / p.pourTime) : 1;
  const pourEnd = Math.min(limits.maxFlow, p.pourFlow + (p.pourEndFlow - p.pourFlow) * shown);
  const pourFrom = { x: pour.x0, y: p.pourFlow };
  const pourTo = { x: pour.x1, y: Math.max(0, pourEnd) };
  laterFlow.push(pourFrom, pourTo);
  const pressureFrom = { x: pour.x0, y: p.pourPressure };
  const pressureTo = { x: pour.x1, y: p.pourPressure };
  pressure.push(pressureTo);
  // The start flow is the value at the left edge, so that is where it is written.
  level('flow', 'pourFlow', 'flow', pourFrom, pourTo, 'start');
  level('pressure', 'pourPressure', 'flow', pressureFrom, pressureTo);
  const pressureLimit: [Point, Point] | undefined =
    p.pourPressureLimit > 0 && p.pourPressureLimit !== p.pourPressure
      ? [
          { x: pour.x0, y: p.pourPressureLimit },
          { x: pour.x1, y: p.pourPressureLimit },
        ]
      : undefined;

  // Temperature: one stretch per phase. A drag moves the group the phase belongs to: the
  // fill's up to the ramp, the flow's from there on. The value is written in the group's own
  // phase, and in another one only where it differs.
  const temperatures: [PhaseId, EditField, NumberField][] = [
    ['fill', 'fillTemperature', 'fillTemperature'],
    ['infuse', 'infuseTemperature', 'fillTemperature'],
    ['secondFill', 'secondFillTemperature', 'fillTemperature'],
    ['pressurize', 'rampTemperature', 'pourTemperature'],
    ['flow', 'pourTemperature', 'pourTemperature'],
  ];
  const temperature: Point[] = [];
  for (const [phase, field, drags] of temperatures) {
    if (phase === 'secondFill' && !second) continue;
    const column = col(phase);
    const from = { x: column.x0, y: p[field] };
    const to = { x: column.x1, y: p[field] };
    temperature.push(from, to);
    const label = field === drags || p[field] !== p[drags] ? 'middle' : 'none';
    level('temperature', field, phase, from, to, label, drags);
  }

  return {
    phases,
    borders,
    levels,
    flow: [fillFlow, laterFlow],
    pressure,
    temperature,
    pressureLimit,
    pauseX,
  };
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
  curve: Pick<Curve, 'levels' | 'borders'>,
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
