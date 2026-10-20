import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, paramRanges, resolveParams, validateParams, type AFlowParams, machineLimits } from '../aflow';
import {
  AXIS_SECONDS,
  FLOW_MIN_UNITS,
  GRAPH_WIDTH,
  MIN_COLUMN_UNITS,
  PAUSE_MIN_UNITS,
  TEMPERATURE_AXIS,
  INFUSE_SECONDS_PER_GRAM,
  REENABLE_SECONDS,
  borderTarget,
  buildCurve,
  dragTarget,
  expectedSeconds,
  infuseWeightSeconds,
  phaseOff,
  weightTarget,
  hitTest,
  temperatureAxis,
  timeAxis,
  type EditField,
  type PhaseId,
  type Projection,
} from './curve';
import { dragValue } from './edit';
import { FIELD_LABEL, FIELD_STEP, PANEL_LABEL, PHASE_FIELDS, formatValue, snap, typedStep } from './fields';

const byId = (id: string): AFlowParams => DEFAULT_PROFILES.find((p) => p.id === id)!.params;
const light = byId('default-light');
const dark = byId('default-dark');
const floral = byId('default-floral');
const withSecondFill: AFlowParams = { ...light, pauseDuration: 15 };

const width = (p: AFlowParams, id: PhaseId) => timeAxis(p).widths[id]!;

describe('timeAxis', () => {
  it('fills the graph exactly, for every default with and without 2nd fill', () => {
    for (const { params } of DEFAULT_PROFILES) {
      for (const pauseDuration of [0, 15]) {
        const { widths } = timeAxis({ ...params, pauseDuration });
        const sum = Object.values(widths).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(GRAPH_WIDTH, 9);
        expect('secondFill' in widths).toBe(pauseDuration > 0);
      }
    }
  });

  it('expects a fill of 3 to 4 s, whatever its time limit', () => {
    expect(expectedSeconds(light).fill).toBeGreaterThanOrEqual(3);
    expect(expectedSeconds(light).fill).toBeLessThanOrEqual(4);
    expect(expectedSeconds({ ...light, fillTime: 100 }).fill).toBe(expectedSeconds(light).fill);
    // A limit shorter than that, or a slower pump, changes it.
    expect(expectedSeconds({ ...light, fillTime: 2 }).fill).toBe(2);
    expect(expectedSeconds({ ...light, fillFlow: 4 }).fill).toBeGreaterThan(expectedSeconds(light).fill);
  });

  it('expects a 2nd fill with its pause to take about as long as the fill', () => {
    const s = expectedSeconds(floral);
    expect(s.secondFill + s.pause).toBeGreaterThanOrEqual(3);
    expect(s.secondFill + s.pause).toBeLessThanOrEqual(4);
    expect(expectedSeconds(light).secondFill + expectedSeconds(light).pause).toBe(0);
  });

  it('keeps the fill thin and makes a long infusion the widest column', () => {
    for (const { params } of DEFAULT_PROFILES) {
      expect(width(params, 'fill')).toBeLessThanOrEqual(12);
    }
    for (const p of [light, floral, { ...dark, infuseTime: 30 }]) {
      const { widths } = timeAxis(p);
      for (const id of ['fill', 'secondFill', 'pressurize'] as const) {
        if (id in widths) expect(widths.infuse).toBeGreaterThan(widths[id]!);
      }
    }
  });

  it('draws the 2nd fill column about as thin as the fill', () => {
    const { widths, pauseWidth } = timeAxis(floral);
    expect(widths.secondFill).toBeLessThanOrEqual(widths.fill! * 2);
    expect(pauseWidth).toBeGreaterThanOrEqual(PAUSE_MIN_UNITS);
    expect(widths.secondFill! - pauseWidth).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
  });

  it('gives the flow phase the rest: more when the phases before it are short', () => {
    expect(width(dark, 'flow')).toBeGreaterThan(width(light, 'flow'));
    expect(width({ ...dark, infuseTime: 20, infuseWeight: 0 }, 'flow')).toBeLessThan(width(dark, 'flow'));
    // dark: 3.5 + 9 (its 2 g) + 5 s of 60 s are taken, the flow phase has the other 42.5 s.
    const axis = timeAxis(dark);
    expect(axis.unitsPerSecond).toBeCloseTo((GRAPH_WIDTH - MIN_COLUMN_UNITS) / (AXIS_SECONDS - 3.5), 6);
    expect(axis.widths.flow).toBeCloseTo(42.5 * axis.unitsPerSecond, 6);
  });

  it('draws the set times on one linear scale', () => {
    const axis = timeAxis({ ...dark, infuseTime: 20, infuseWeight: 0, rampTime: 10 });
    expect(axis.widths.infuse).toBeCloseTo(20 * axis.unitsPerSecond, 9);
    expect(axis.widths.pressurize).toBeCloseTo(10 * axis.unitsPerSecond, 9);
    expect(axis.widths.infuse! / axis.widths.pressurize!).toBeCloseTo(2, 9);
  });

  it('widens a column with its time', () => {
    let last = 0;
    for (const infuseTime of [10, 20, 30, 40]) {
      const w = width({ ...dark, infuseTime, infuseWeight: 0 }, 'infuse');
      expect(w).toBeGreaterThan(last);
      last = w;
    }
    // Once every other column is at its minimum, the column has all the room there is.
    const most = GRAPH_WIDTH - 2 * MIN_COLUMN_UNITS - FLOW_MIN_UNITS;
    expect(width({ ...dark, infuseTime: 60, infuseWeight: 0 }, 'infuse')).toBeCloseTo(most, 9);
    expect(width({ ...dark, infuseTime: 127, infuseWeight: 0 }, 'infuse')).toBeCloseTo(most, 9);
  });

  it('never makes a column narrower than a finger, at any times, unless its phase is off', () => {
    const extremes: Partial<AFlowParams>[] = [
      { fillTime: 0, infuseTime: 0, rampTime: 0, pauseDuration: 0 },
      { fillTime: 0, infuseTime: 0, rampTime: 0, secondFillTime: 0, pauseDuration: 1 },
      { fillTime: 127, infuseTime: 127, rampTime: 127, secondFillTime: 127, pauseDuration: 127 },
      { fillFlow: 0.1, secondFillFlow: 0.1, pauseDuration: 127 },
      { infuseTime: 127, rampTime: 0 },
      { infuseTime: 0, rampTime: 127 },
    ];
    for (const change of extremes) {
      const p = { ...light, ...change };
      const { widths, pauseWidth, unitsPerSecond } = timeAxis(p);
      expect(unitsPerSecond).toBeGreaterThan(0);
      expect(widths.fill).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
      if (p.infuseTime > 0) expect(widths.infuse).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
      else expect(widths.infuse).toBe(0);
      if (p.rampTime > 0) expect(widths.pressurize).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
      else expect(widths.pressurize).toBe(0);
      expect(widths.flow).toBeGreaterThanOrEqual(FLOW_MIN_UNITS);
      if (p.pauseDuration > 0) {
        expect(pauseWidth).toBeGreaterThanOrEqual(PAUSE_MIN_UNITS);
        expect(widths.secondFill! - pauseWidth).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS - 1e-9);
      }
      expect(Object.values(widths).reduce((a, b) => a + b, 0)).toBeCloseTo(GRAPH_WIDTH, 9);
    }
  });
});

describe('buildCurve', () => {
  it('has the four columns of a profile without 2nd fill, edge to edge', () => {
    const curve = buildCurve(light);
    expect(curve.phases.map((c) => c.id)).toEqual(['fill', 'infuse', 'pressurize', 'flow']);
    expect(curve.phases[0].x0).toBe(0);
    expect(curve.phases.at(-1)!.x1).toBe(GRAPH_WIDTH);
    for (let i = 1; i < curve.phases.length; i++) {
      expect(curve.phases[i].x0).toBeCloseTo(curve.phases[i - 1].x1, 9);
      expect(curve.phases[i].x1).toBeGreaterThan(curve.phases[i].x0);
    }
    expect(curve.pauseX).toBeUndefined();
  });

  it('takes its column widths from the time axis', () => {
    for (const p of [light, floral, dark]) {
      const { widths } = timeAxis(p);
      for (const column of buildCurve(p).phases) {
        expect(column.x1 - column.x0).toBeCloseTo(widths[column.id]!, 9);
      }
    }
  });

  it('adds the 2nd fill column, its level and its border only with the toggle on', () => {
    const off = buildCurve(light);
    const on = buildCurve(withSecondFill);
    expect(on.phases.map((c) => c.id)).toEqual(['fill', 'infuse', 'secondFill', 'pressurize', 'flow']);
    expect(off.borders.map((b) => b.field)).toEqual(['infuseTime', 'rampTime']);
    expect(on.borders.map((b) => b.field)).toEqual(['infuseTime', 'pauseDuration', 'rampTime']);
    expect(off.levels.some((l) => l.field === 'secondFillFlow')).toBe(false);
    expect(on.levels.some((l) => l.field === 'secondFillFlow')).toBe(true);
    const second = on.phases.find((c) => c.id === 'secondFill')!;
    expect(on.pauseX).toBeGreaterThan(second.x0);
    expect(on.pauseX).toBeLessThan(second.x1);
  });

  it('marks the pause border, and only it, as dragged in detail mode only', () => {
    const curve = buildCurve(withSecondFill);
    expect(curve.borders.filter((b) => b.detailOnly).map((b) => b.field)).toEqual(['pauseDuration']);
  });

  it('puts every border on the right edge of its phase, with the seconds a unit is worth', () => {
    const curve = buildCurve(withSecondFill);
    const axis = timeAxis(withSecondFill);
    for (const border of curve.borders) {
      expect(border.x).toBe(curve.phases.find((c) => c.id === border.phase)!.x1);
      expect(border.secondsPerUnit).toBeGreaterThan(0);
    }
    const at = (field: string) => curve.borders.find((b) => b.field === field)!;
    expect(at('infuseTime').secondsPerUnit).toBeCloseTo(1 / axis.unitsPerSecond, 9);
    expect(at('rampTime').secondsPerUnit).toBeCloseTo(1 / axis.unitsPerSecond, 9);
    // The pause is drawn at a share of its time: a unit is worth more of it.
    expect(at('pauseDuration').secondsPerUnit).toBeGreaterThan(at('infuseTime').secondsPerUnit);
  });

  it('draws each level at its parameter', () => {
    const curve = buildCurve(withSecondFill);
    const at = (field: string) => curve.levels.find((l) => l.field === field)!;
    expect(at('fillFlow').from.y).toBe(light.fillFlow);
    expect(at('infusePressure').to.y).toBe(light.infusePressure);
    expect(at('secondFillFlow').from.y).toBe(light.secondFillFlow);
    expect(at('pourPressure').from.y).toBe(light.pourPressure);
    expect(at('pourFlow').from.y).toBe(light.pourFlow);
    expect(at('fillTemperature').from.y).toBe(light.fillTemperature);
    expect(at('pourTemperature').to.y).toBe(light.pourTemperature);
  });

  it('has one level per value, and a drag for every value simple mode changes', () => {
    const curve = buildCurve(withSecondFill);
    const shown = curve.levels.map((l) => l.field);
    expect(new Set(shown).size).toBe(shown.length);
    const dragged = new Set([...curve.levels.map((l) => l.drags), ...curve.borders.map((b) => b.field)]);
    expect([...dragged].sort()).toEqual(
      [
        'fillFlow',
        'fillTemperature',
        'infusePressure',
        'infuseTime',
        'secondFillFlow',
        'pauseDuration',
        'pourPressure',
        'rampTime',
        'pourFlow',
        'pourTemperature',
      ].sort(),
    );
  });

  it('does not draw the flow line during the infuse phase', () => {
    for (const { params } of DEFAULT_PROFILES) {
      for (const pauseDuration of [0, 15]) {
        const curve = buildCurve({ ...params, pauseDuration });
        const infuse = curve.phases.find((c) => c.id === 'infuse')!;
        expect(curve.flow).toHaveLength(2);
        for (const stretch of curve.flow) {
          const from = stretch[0].x;
          const to = stretch.at(-1)!.x;
          expect(to).toBeGreaterThan(from);
          // Each stretch lies left of the infuse column or right of it.
          expect(to <= infuse.x0 || from >= infuse.x1).toBe(true);
          for (let i = 1; i < stretch.length; i++) {
            expect(stretch[i].x).toBeGreaterThanOrEqual(stretch[i - 1].x);
          }
        }
        expect(curve.flow[0][0].x).toBe(0);
        expect(curve.flow[0].at(-1)!.x).toBe(infuse.x0);
        expect(curve.flow[1][0].x).toBe(infuse.x1);
        expect(curve.flow[1].at(-1)!.x).toBe(GRAPH_WIDTH);
      }
    }
  });

  it('drops the flow to 0 at the end of the fill with a vertical edge', () => {
    for (const { params } of DEFAULT_PROFILES) {
      for (const pauseDuration of [0, 15]) {
        const p = { ...params, pauseDuration };
        const curve = buildCurve(p);
        const fill = curve.phases.find((c) => c.id === 'fill')!;
        expect(curve.flow[0].slice(-2)).toEqual([
          { x: fill.x1, y: resolveParams(p).fillFlow },
          { x: fill.x1, y: 0 },
        ]);
      }
    }
  });

  it('raises the flow from 0 at the start of the 2nd fill with a vertical edge, and only with it', () => {
    for (const { params } of DEFAULT_PROFILES) {
      const on = { ...params, pauseDuration: 15 };
      const curve = buildCurve(on);
      const column = curve.phases.find((c) => c.id === 'secondFill')!;
      expect(curve.flow[1].slice(0, 2)).toEqual([
        { x: column.x0, y: 0 },
        { x: column.x0, y: resolveParams(on).secondFillFlow },
      ]);
      // Without the 2nd fill the flow starts again at the ramp, as before.
      const off = buildCurve({ ...params, pauseDuration: 0 });
      const pressurize = off.phases.find((c) => c.id === 'pressurize')!;
      expect(off.flow[1][0].x).toBe(pressurize.x0);
      expect(off.flow[1][0].y).toBeGreaterThan(0);
    }
  });

  it('keeps the edges out of the draggable levels and out of the hit test', () => {
    const p = { ...DEFAULT_PROFILES[0].params, pauseDuration: 15 };
    const curve = buildCurve(p);
    const fill = curve.phases.find((c) => c.id === 'fill')!;
    const column = curve.phases.find((c) => c.id === 'secondFill')!;
    const flows = curve.levels.filter((level) => level.line === 'flow');
    // Every flow level is horizontal or the pour's slope: none is a vertical edge.
    for (const level of flows) expect(level.to.x).toBeGreaterThan(level.from.x);
    const fillLevel = flows.find((level) => level.field === 'fillFlow')!;
    expect(fillLevel.from).toEqual({ x: fill.x0, y: resolveParams(p).fillFlow });
    expect(fillLevel.to).toEqual({ x: fill.x1, y: resolveParams(p).fillFlow });
    const secondLevel = flows.find((level) => level.field === 'secondFillFlow')!;
    expect(secondLevel.from).toEqual({ x: column.x0, y: resolveParams(p).secondFillFlow });
    // Halfway down the fill's edge, a finger finds no flow level to drag: the edge sits on
    // the fill's border, and only the level's own height takes hold of it.
    const projection = { x: (u: number) => u * 10, y: (_: string, v: number) => 1000 - v * 20 };
    const y = projection.y('flow', resolveParams(p).fillFlow / 2);
    const hit = hitTest(curve, fill.x1 * 10, y, projection, 5, 0);
    expect(hit?.kind === 'level' && hit.level.line === 'flow').toBe(false);
  });

  it('runs the pressure and the temperature left to right over the whole graph', () => {
    for (const { params } of DEFAULT_PROFILES) {
      for (const pauseDuration of [0, 15]) {
        const curve = buildCurve({ ...params, pauseDuration });
        for (const line of [curve.pressure, curve.temperature]) {
          expect(line[0].x).toBe(0);
          expect(line.at(-1)!.x).toBe(GRAPH_WIDTH);
          for (let i = 1; i < line.length; i++) {
            expect(line[i].x).toBeGreaterThanOrEqual(line[i - 1].x);
          }
        }
      }
    }
  });

  it('writes the start flow at the left end of its line, the other values in the middle', () => {
    const curve = buildCurve(withSecondFill);
    const labels = Object.fromEntries(curve.levels.map((l) => [l.field, l.label]));
    expect(labels.pourFlow).toBe('start');
    expect(labels.fillFlow).toBe('middle');
    expect(labels.secondFillFlow).toBe('middle');
    expect(labels.pourPressure).toBe('middle');
    const pourFlow = curve.levels.find((l) => l.field === 'pourFlow')!;
    expect(pourFlow.from.x).toBe(curve.phases.at(-1)!.x0);
    expect(pourFlow.from.y).toBe(light.pourFlow);
  });

  it('ramps the pressure to the pour pressure over the pressurize column', () => {
    const curve = buildCurve(light);
    const pressurize = curve.phases.find((c) => c.id === 'pressurize')!;
    const start = curve.pressure.filter((pt) => pt.x === pressurize.x0).at(-1)!;
    const end = curve.pressure.find((pt) => pt.x === pressurize.x1)!;
    expect(start.y).toBe(light.infusePressure);
    expect(end.y).toBe(light.pourPressure);
  });

  it('builds the fill pressure to the move-on pressure', () => {
    const curve = buildCurve({ ...light, fillExitPressure: 4.5 });
    expect(curve.pressure[1]).toEqual({ x: curve.phases[0].x1, y: 4.5 });
  });

  it('lets the pour flow rise with flow up and fall with flow down', () => {
    const up = buildCurve({ ...light, flowUp: true });
    const down = buildCurve({ ...light, flowUp: false });
    const end = (curve: typeof up) => curve.flow.at(-1)!.at(-1)!.y;
    expect(end(up)).toBeGreaterThan(light.pourFlow);
    expect(end(down)).toBeLessThan(light.pourFlow);
    expect(end(down)).toBeGreaterThanOrEqual(0);
  });

  it('moves the end of the pour flow with the flow gradient and the flow time', () => {
    const end = (p: AFlowParams) => buildCurve(p).flow.at(-1)!.at(-1)!.y;
    expect(end({ ...light, pourEndFlow: 3 })).toBe(light.pourFlow);
    expect(end({ ...light, pourEndFlow: 1 })).toBeLessThan(light.pourFlow);
    // A shorter flow time reaches the end flow sooner.
    expect(end({ ...light, pourTime: 30 })).toBeGreaterThan(end(light));
    expect(end({ ...light, pourTime: 0 })).toBe(resolveParams(light).pourEndFlow);
  });

  it('draws the max. pressure only where it is not the target pressure', () => {
    expect(buildCurve(light).pressureLimit).toBeUndefined();
    expect(buildCurve({ ...light, pourPressureLimit: light.pourPressure }).pressureLimit).toBeUndefined();
    expect(buildCurve({ ...light, pourPressureLimit: 0 }).pressureLimit).toBeUndefined();
    const limit = buildCurve({ ...light, pourPressureLimit: 11 }).pressureLimit!;
    expect(limit.map((pt) => pt.y)).toEqual([11, 11]);
    expect(limit[1].x).toBe(GRAPH_WIDTH);
  });

  it('draws each phase at its own temperature', () => {
    const curve = buildCurve({
      ...withSecondFill,
      fillTemperature: 95,
      infuseTemperature: 92,
      secondFillTemperature: 90,
      rampTemperature: 89,
      pourTemperature: 88,
    });
    const at = (id: PhaseId) => {
      const column = curve.phases.find((c) => c.id === id)!;
      return curve.temperature.filter((pt) => pt.x === column.x0).at(-1)!.y;
    };
    expect(curve.phases.map((c) => at(c.id))).toEqual([95, 92, 90, 89, 88]);
  });

  it('moves the fill group or the flow group with a temperature line', () => {
    const curve = buildCurve(withSecondFill);
    const drags = Object.fromEntries(curve.levels.filter((l) => l.line === 'temperature').map((l) => [l.phase, l.drags]));
    expect(drags).toEqual({
      fill: 'fillTemperature',
      infuse: 'fillTemperature',
      secondFill: 'fillTemperature',
      pressurize: 'pourTemperature',
      flow: 'pourTemperature',
    });
  });

  it('writes a temperature once per group, and again where a phase has its own', () => {
    const labelled = (p: AFlowParams) =>
      buildCurve(p)
        .levels.filter((l) => l.line === 'temperature' && l.label !== 'none')
        .map((l) => l.field);
    expect(labelled(withSecondFill)).toEqual(['fillTemperature', 'pourTemperature']);
    expect(labelled({ ...withSecondFill, infuseTemperature: 90 })).toEqual([
      'fillTemperature',
      'infuseTemperature',
      'secondFillTemperature',
      'pourTemperature',
    ]);
    expect(labelled({ ...light, rampTemperature: 90 })).toEqual(['fillTemperature', 'rampTemperature', 'pourTemperature']);
  });

  it('keeps a column as wide as a finger for a ramp of 1 s', () => {
    const curve = buildCurve({ ...light, rampTime: 1 });
    const pressurize = curve.phases.find((c) => c.id === 'pressurize')!;
    expect(pressurize.x1 - pressurize.x0).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
  });
});

describe('hitTest', () => {
  // 10 px per graph unit; 20 px per bar, ml/s or °C, the larger value higher on the screen.
  const projection: Projection = {
    x: (units) => units * 10,
    y: (line, value) => (line === 'temperature' ? (105 - value) * 20 : 1000 - value * 20),
  };
  const curve = buildCurve(light);
  const infuse = curve.phases.find((c) => c.id === 'infuse')!;
  const midInfuse = ((infuse.x0 + infuse.x1) / 2) * 10;

  it('takes the level line under the finger', () => {
    const hit = hitTest(curve, midInfuse, 1000 - light.infusePressure * 20 + 12, projection, 28, 22);
    expect(hit).toMatchObject({ kind: 'level', level: { field: 'infusePressure' } });
  });

  it('takes the nearer of two lines', () => {
    const pour = curve.phases.at(-1)!;
    const x = pour.x0 * 10 + 30;
    const near = (value: number) => hitTest(curve, x, 1000 - value * 20, projection, 60, 0);
    expect(near(light.pourPressure - 0.5)).toMatchObject({ level: { field: 'pourPressure' } });
    expect(near(light.pourFlow + 0.5)).toMatchObject({ level: { field: 'pourFlow' } });
  });

  it('follows the slope of the pour flow', () => {
    const pour = curve.phases.at(-1)!;
    const end = curve.flow.at(-1)!.at(-1)!;
    const hit = hitTest(curve, pour.x1 * 10 - 1, 1000 - end.y * 20, projection, 5, 0);
    expect(hit).toMatchObject({ kind: 'level', level: { field: 'pourFlow' } });
  });

  it('takes a border away from any line', () => {
    const hit = hitTest(curve, infuse.x1 * 10 + 10, 600, projection, 28, 22);
    expect(hit).toMatchObject({ kind: 'border', border: { field: 'infuseTime' } });
  });

  it('takes nothing in empty space, and no flow line in the infuse phase', () => {
    expect(hitTest(curve, midInfuse, 600, projection, 28, 22)).toBeNull();
    expect(hitTest(curve, midInfuse, 1000 - 0.6 * 20, projection, 10, 0)).toBeNull();
  });

  it('takes the temperature line in its own band, for its group', () => {
    const hit = hitTest(curve, midInfuse, (105 - light.fillTemperature) * 20 - 5, projection, 28, 22);
    expect(hit).toMatchObject({
      kind: 'level',
      level: { field: 'infuseTemperature', drags: 'fillTemperature' },
    });
  });

  it('leaves out the borders it is not given: the pause in simple mode', () => {
    const on = buildCurve(withSecondFill);
    const pause = on.borders.find((b) => b.field === 'pauseDuration')!;
    const simple = { levels: on.levels, borders: on.borders.filter((b) => !b.detailOnly) };
    expect(hitTest(on, pause.x * 10, 600, projection, 28, 22)).toMatchObject({
      border: { field: 'pauseDuration' },
    });
    expect(hitTest(simple, pause.x * 10, 600, projection, 28, 22)).toBeNull();
  });
});

describe('fields', () => {
  const all = Object.keys(paramRanges()) as EditField[];

  it('snaps into the generator range, on the step', () => {
    const ranges = paramRanges();
    expect(snap('pourPressure', 99)).toBe(ranges.pourPressure.max);
    expect(snap('pourFlow', -3)).toBe(ranges.pourFlow.min);
    expect(snap('fillTemperature', 93.26)).toBe(93.5);
    expect(snap('infuseTime', 12.4)).toBe(12);
    expect(snap('infusePressure', 3.04999)).toBe(3);
    expect(snap('dose', 18.1 + 0.1)).toBe(18.2);
  });

  it('keeps a typed value as typed: tenths, or whole for times and the stop weight', () => {
    expect(snap('fillTemperature', 93.2, undefined, typedStep('fillTemperature'))).toBe(93.2);
    expect(snap('infuseTime', 10, undefined, typedStep('infuseTime'))).toBe(10);
    expect(typedStep('infuseTime')).toBe(1);
    expect(typedStep('stopWeight')).toBe(1);
    expect(typedStep('pourPressure')).toBe(0.1);
  });

  it('gives valid parameters after any number of steps', () => {
    let params = { ...light };
    for (const field of all) {
      for (let i = 0; i < 37; i++) {
        params = { ...params, [field]: snap(field, resolveParams(params)[field] + FIELD_STEP[field]) };
      }
      for (let i = 0; i < 11; i++) {
        params = { ...params, [field]: snap(field, resolveParams(params)[field] - FIELD_STEP[field]) };
      }
    }
    expect(validateParams(params)).toEqual([]);
  });

  it('has a name, a panel name and a step for every value', () => {
    for (const field of all) {
      expect(FIELD_LABEL[field]).toBeTruthy();
      expect(PANEL_LABEL[field]).toBeTruthy();
      expect(FIELD_STEP[field]).toBeGreaterThan(0);
    }
  });

  // The founder's list 'values to be changable' (review of 2026-10-12), value by value. Its
  // 'move on pressure pause' is the flow the pause ends under (founder, 2026-10-13).
  it('lists per phase exactly the values of the review', () => {
    expect(PHASE_FIELDS).toEqual({
      fill: ['fillFlow', 'fillExitPressure', 'fillTemperature', 'fillTime'],
      infuse: ['infusePressure', 'infuseTime', 'infuseWeight', 'infuseTemperature', 'infuseFlowLimit'],
      secondFill: [
        'secondFillFlow',
        'secondFillExitPressure',
        'secondFillTemperature',
        'secondFillTime',
        'pauseDuration',
        'pauseExitFlow',
      ],
      pressurize: ['pourPressure', 'rampTime', 'rampTemperature'],
      flow: ['pourFlow', 'pourEndFlow', 'pourTime', 'pourTemperature', 'stopWeight', 'pourPressureLimit'],
    });
  });

  it('lists every value once, and dose under no phase', () => {
    const listed = Object.values(PHASE_FIELDS).flat();
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed, 'dose'].sort()).toEqual([...all].sort());
  });

  it('formats a value with its unit', () => {
    expect(formatValue('pourPressure', 9.5)).toBe('9.5 bar');
    expect(formatValue('pourFlow', 2)).toBe('2 ml/s');
    expect(formatValue('infuseTime', 60)).toBe('60 s');
    expect(formatValue('fillTemperature', 93)).toBe('93 °C');
  });
});

describe('temperatureAxis', () => {
  it('is 80 to 100 °C while every temperature is inside', () => {
    expect(temperatureAxis([])).toEqual({ min: 80, max: 100 });
    expect(temperatureAxis([80, 92, 100])).toEqual(TEMPERATURE_AXIS);
  });

  it('widens down to the next 5 °C step with room', () => {
    expect(temperatureAxis([78, 94])).toEqual({ min: 75, max: 100 });
    expect(temperatureAxis([75, 94])).toEqual({ min: 70, max: 100 });
    expect(temperatureAxis([79.5])).toEqual({ min: 75, max: 100 });
  });

  it('widens up to the next 5 °C step with room', () => {
    expect(temperatureAxis([90, 101])).toEqual({ min: 80, max: 105 });
    expect(temperatureAxis([70, 102.5])).toEqual({ min: 65, max: 105 });
  });

  it('narrows back when no temperature is outside any more', () => {
    expect(temperatureAxis([78])).toEqual({ min: 75, max: 100 });
    expect(temperatureAxis([80.5])).toEqual({ min: 80, max: 100 });
  });

  it('stays within the allowed temperatures', () => {
    expect(temperatureAxis([50, 105])).toEqual({ min: 50, max: 105 });
    expect(temperatureAxis([52, 104])).toEqual({ min: 50, max: 105 });
    expect(temperatureAxis([60], { min: 58, max: 100 })).toEqual({ min: 58, max: 100 });
  });

  it('fits every default profile in 80 to 100 °C', () => {
    for (const { params } of DEFAULT_PROFILES) {
      const values = buildCurve(params).temperature.map((pt) => pt.y);
      expect(temperatureAxis(values)).toEqual(TEMPERATURE_AXIS);
    }
  });
});

// founder, 2026-10-16: in detail mode the left half of the last step's flow line drags the
// start flow, the right half the end flow; simple mode keeps one line for the start flow.
describe('the split flow line of detail mode', () => {
  const projection: Projection = {
    x: (units) => units * 10,
    y: (line, value) => (line === 'temperature' ? (105 - value) * 20 : 1000 - value * 20),
  };
  const pourLevels = (curve: ReturnType<typeof buildCurve>) => curve.levels.filter((l) => l.line === 'flow' && l.phase === 'flow');
  /** What a finger on the pour flow line at a share of the column's width takes hold of. */
  const at = (p: AFlowParams, share: number, mode: 'simple' | 'detail') => {
    const curve = buildCurve(p, undefined, mode);
    const pour = curve.phases.at(-1)!;
    const [from, to] = [curve.flow.at(-1)!.at(-2)!, curve.flow.at(-1)!.at(-1)!];
    const x = pour.x0 + (pour.x1 - pour.x0) * share;
    const y = from.y + ((to.y - from.y) * (x - from.x)) / (to.x - from.x);
    const hit = hitTest(curve, x * 10, 1000 - y * 20, projection, 10, 0);
    return hit?.kind === 'level' ? hit.level : null;
  };

  it('is one start flow line in simple mode', () => {
    expect(pourLevels(buildCurve(light)).map((l) => l.field)).toEqual(['pourFlow']);
    expect(at(light, 0.25, 'simple')?.drags).toBe('pourFlow');
    expect(at(light, 0.75, 'simple')?.drags).toBe('pourFlow');
  });

  it('drags the start flow on its left half and the end flow on its right half', () => {
    for (const p of [light, dark, { ...light, pourEndFlow: 1 }]) {
      expect(at(p, 0.1, 'detail')?.drags).toBe('pourFlow');
      expect(at(p, 0.45, 'detail')?.drags).toBe('pourFlow');
      expect(at(p, 0.55, 'detail')?.drags).toBe('pourEndFlow');
      expect(at(p, 0.95, 'detail')?.drags).toBe('pourEndFlow');
    }
  });

  it('draws the same line as simple mode, split in the middle, the end flow written at its end', () => {
    const simple = buildCurve(light);
    const detail = buildCurve(light, undefined, 'detail');
    expect(detail.flow).toEqual(simple.flow);
    const [start, end] = pourLevels(detail);
    expect(start.to).toEqual(end.from);
    expect(start.to.x).toBeCloseTo((start.from.x + end.to.x) / 2);
    expect([start.label, end.label]).toEqual(['start', 'end']);
    expect(FIELD_LABEL.pourEndFlow).toBe('end flow');
    expect(PANEL_LABEL.pourEndFlow).toBe('end flow');
  });

  it('keeps the end of the line under the finger: the end flow moves by the line’s inverse share', () => {
    // light's 60 s flow time is drawn for 30 s: the line's end moves half the end flow's change.
    for (const p of [light, { ...light, pourTime: 30 }, { ...light, pourTime: 90, pourEndFlow: 1.5 }]) {
      const curve = buildCurve(p, undefined, 'detail');
      const end = pourLevels(curve)[1];
      const start = resolveParams(p).pourEndFlow;
      const value = snap('pourEndFlow', dragTarget(end, start, 0.6));
      const moved = buildCurve(dragValue(p, 'pourEndFlow', value), undefined, 'detail');
      expect(moved.flow.at(-1)!.at(-1)!.y).toBeCloseTo(curve.flow.at(-1)!.at(-1)!.y + 0.6, 1);
      // The start flow does not move with it.
      expect(moved.flow.at(-1)!.at(-2)!.y).toBe(p.pourFlow);
    }
    // The start flow follows the finger one to one.
    expect(dragTarget(pourLevels(buildCurve(light, undefined, 'detail'))[0], 2, 0.5)).toBe(2.5);
  });

  it('keeps both drags inside their ranges and the maximum flow of the settings', () => {
    const end = pourLevels(buildCurve(light, undefined, 'detail'))[1];
    const limits = machineLimits(6);
    expect(snap('pourEndFlow', dragTarget(end, 4, 10), limits)).toBe(6);
    expect(snap('pourEndFlow', dragTarget(end, 4, -10), limits)).toBe(0);
    expect(snap('pourFlow', dragTarget({ gain: 1 }, 2, 10), limits)).toBe(6);
    expect(snap('pourFlow', dragTarget({ gain: 1 }, 2, -10), limits)).toBe(paramRanges(limits).pourFlow.min);
  });

  it('a drag of the end flow sets it and the toggle text to match; the start flow is left alone', () => {
    const down = dragValue({ ...light, flowUp: true }, 'pourEndFlow', 1);
    expect(down).toMatchObject({ pourEndFlow: 1, flowUp: false, pourFlow: light.pourFlow });
    const up = dragValue({ ...light, flowUp: false }, 'pourEndFlow', 5);
    expect(up).toMatchObject({ pourEndFlow: 5, flowUp: true });
  });
});

// Review of 2026-10-16, A2: the infuse is drawn by its move-on weight, the weight is dragged,
// and a phase dragged to 0 s collapses.
describe('the infuse drawn by its weight', () => {
  it("is the founder's estimate: 1 g is 5 s, 6 g is 25 s, on one straight line", () => {
    expect(infuseWeightSeconds(1)).toBe(5);
    expect(infuseWeightSeconds(6)).toBe(25);
    expect(infuseWeightSeconds(3.6)).toBeCloseTo(15.4, 9);
    expect(infuseWeightSeconds(2) - infuseWeightSeconds(1)).toBe(INFUSE_SECONDS_PER_GRAM);
  });

  it('takes the weight, not a time limit of 60 s; the time where it is shorter', () => {
    expect(expectedSeconds(light).infuse).toBe(25); // 60 s, 6 g
    expect(expectedSeconds({ ...light, infuseWeight: 1 }).infuse).toBe(5);
    expect(expectedSeconds(dark).infuse).toBe(9); // 10 s, 2 g
    expect(expectedSeconds({ ...light, infuseTime: 12 }).infuse).toBe(12);
    // Without a move-on weight the time ends the infuse.
    expect(expectedSeconds({ ...light, infuseWeight: 0 }).infuse).toBe(60);
  });

  it('draws the infuse column as wide as the estimate, on the scale of the other times', () => {
    const axis = timeAxis(light);
    expect(axis.widths.infuse).toBeCloseTo(25 * axis.unitsPerSecond, 9);
    const twelve = timeAxis({ ...light, infuseWeight: 2.75 }); // 12 s
    expect(twelve.widths.infuse).toBeCloseTo(12 * twelve.unitsPerSecond, 9);
    expect(twelve.widths.infuse! / twelve.widths.pressurize!).toBeCloseTo(12 / 10, 9);
    // A heavier weight is a wider column, up to the time limit.
    expect(width({ ...light, infuseWeight: 8 }, 'infuse')).toBeGreaterThan(width(light, 'infuse'));
    expect(width({ ...light, infuseWeight: 30 }, 'infuse')).toBeCloseTo(width({ ...light, infuseWeight: 0 }, 'infuse'), 9);
  });

  it('starts the drag of the infuse border where it is drawn', () => {
    const infuse = buildCurve(light).borders.find((b) => b.field === 'infuseTime')!;
    expect(infuse.start).toBe(25);
    expect(infuse.weightSeconds).toBe(25);
    expect(buildCurve({ ...light, infuseWeight: 0 }).borders[0].weightSeconds).toBeUndefined();
    expect(buildCurve({ ...light, infuseWeight: 0 }).borders[0].start).toBe(60);
    const ramp = buildCurve(light).borders.find((b) => b.field === 'rampTime')!;
    expect(ramp.start).toBe(light.rampTime);
  });

  it('cuts the time only where the border goes left of the weight; a touch keeps 60 s', () => {
    const border = { weightSeconds: 25 };
    expect(borderTarget(border, 60, 25)).toBe(60);
    expect(borderTarget(border, 60, 24.7)).toBe(60);
    expect(borderTarget(border, 60, 20)).toBe(20);
    expect(borderTarget(border, 60, 0)).toBe(0);
    // Back to the right of the weight: the time limit returns.
    expect(borderTarget(border, 60, 30)).toBe(60);
    expect(borderTarget(border, 60, 70)).toBe(70);
    // A time shorter than the estimate ends the infuse: the border is the time.
    expect(borderTarget(border, 12, 15)).toBe(15);
    expect(borderTarget(border, 12, 30)).toBe(30);
    // Without a weight, and for the other borders, the drag is the time.
    expect(borderTarget({}, 60, 40)).toBe(40);
  });
});

describe('the drag of the infuse-to weight', () => {
  it('keeps the estimate under the finger: 4 s to the right is 1 g more', () => {
    expect(weightTarget(6, 4)).toBe(7);
    expect(weightTarget(6, -20)).toBe(1);
    expect(infuseWeightSeconds(weightTarget(3.6, 7))).toBeCloseTo(infuseWeightSeconds(3.6) + 7, 9);
  });

  it('moves the infuse border by as much as the finger', () => {
    const before = buildCurve(light);
    const value = snap('infuseWeight', weightTarget(light.infuseWeight, 8));
    expect(value).toBe(8);
    const after = buildCurve(dragValue(light, 'infuseWeight', value));
    const x = (c: typeof before) => c.borders.find((b) => b.field === 'infuseTime')!.x;
    const unitsPerSecond = timeAxis(light).unitsPerSecond;
    expect(x(after) - x(before)).toBeCloseTo(8 * unitsPerSecond, 1);
  });

  it('stays in the weight range', () => {
    expect(snap('infuseWeight', weightTarget(1, -60))).toBe(paramRanges().infuseWeight.min);
    expect(snap('infuseWeight', weightTarget(999, 60))).toBe(paramRanges().infuseWeight.max);
  });
});

describe('a phase dragged to 0 s', () => {
  it('is off: infuse and pressurize, not the fill', () => {
    expect(phaseOff({ ...light, infuseTime: 0 }, 'infuse')).toBe(true);
    expect(phaseOff({ ...light, rampTime: 0 }, 'pressurize')).toBe(true);
    expect(phaseOff(light, 'infuse')).toBe(false);
    expect(phaseOff({ ...light, fillTime: 0 }, 'fill')).toBe(false);
  });

  it('collapses to no width, and the others keep the graph filled', () => {
    for (const change of [{ infuseTime: 0 }, { rampTime: 0 }, { infuseTime: 0, rampTime: 0 }]) {
      for (const p of [
        { ...light, ...change },
        { ...floral, ...change },
      ]) {
        const curve = buildCurve(p);
        for (const id of ['infuse', 'pressurize'] as const) {
          const column = curve.phases.find((c) => c.id === id)!;
          expect(column.x1 - column.x0 === 0).toBe(phaseOff(p, id));
          expect(curve.off.includes(id)).toBe(phaseOff(p, id));
          expect(curve.borders.find((b) => b.phase === id)!.off).toBe(phaseOff(p, id));
        }
        expect(curve.phases.at(-1)!.x1).toBe(GRAPH_WIDTH);
        const sum = Object.values(timeAxis(p).widths).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(GRAPH_WIDTH, 9);
      }
    }
    // The fill is as wide as before: the room goes to the flow phase.
    const off = timeAxis({ ...light, infuseTime: 0 });
    expect(off.widths.fill).toBe(timeAxis(light).widths.fill);
    expect(off.widths.flow).toBeGreaterThan(timeAxis(light).widths.flow!);
    expect(buildCurve(light).off).toEqual([]);
  });

  it('cannot be taken hold of at its border while it is off', () => {
    const curve = buildCurve({ ...light, infuseTime: 0 });
    const projection: Projection = { x: (u) => u * 10, y: (_l, v) => 1000 - v * 20 };
    const draggable = { levels: curve.levels, borders: curve.borders.filter((b) => !b.off) };
    const fillEnd = curve.phases.find((c) => c.id === 'fill')!.x1;
    const hit = hitTest(draggable, fillEnd * 10, 500, projection, 0, 20);
    expect(hit?.kind === 'border' && hit.border.field === 'infuseTime').toBe(false);
  });

  it('is turned on again with 5 s, which draws it again', () => {
    expect(REENABLE_SECONDS).toBe(5);
    const p = dragValue({ ...light, infuseTime: 0 }, 'infuseTime', REENABLE_SECONDS);
    expect(phaseOff(p, 'infuse')).toBe(false);
    expect(width(p, 'infuse')).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
    const ramp = dragValue({ ...light, rampTime: 0 }, 'rampTime', REENABLE_SECONDS);
    expect(width(ramp, 'pressurize')).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
  });
});
