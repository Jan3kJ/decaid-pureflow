import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILES,
  paramRanges,
  resolveParams,
  validateParams,
  type AFlowParams,
} from '../aflow';
import {
  AXIS_SECONDS,
  FLOW_MIN_UNITS,
  GRAPH_WIDTH,
  MIN_COLUMN_UNITS,
  PAUSE_MIN_UNITS,
  buildCurve,
  expectedSeconds,
  hitTest,
  timeAxis,
  type EditField,
  type PhaseId,
  type Projection,
} from './curve';
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
    expect(expectedSeconds({ ...light, fillFlow: 4 }).fill).toBeGreaterThan(
      expectedSeconds(light).fill,
    );
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
    expect(width({ ...dark, infuseTime: 20 }, 'flow')).toBeLessThan(width(dark, 'flow'));
    // dark: 3.5 + 10 + 5 s of 60 s are taken, the flow phase has the other 41.5 s.
    const axis = timeAxis(dark);
    expect(axis.unitsPerSecond).toBeCloseTo(
      (GRAPH_WIDTH - MIN_COLUMN_UNITS) / (AXIS_SECONDS - 3.5),
      6,
    );
    expect(axis.widths.flow).toBeCloseTo(41.5 * axis.unitsPerSecond, 6);
  });

  it('draws the set times on one linear scale', () => {
    const axis = timeAxis({ ...dark, infuseTime: 20, rampTime: 10 });
    expect(axis.widths.infuse).toBeCloseTo(20 * axis.unitsPerSecond, 9);
    expect(axis.widths.pressurize).toBeCloseTo(10 * axis.unitsPerSecond, 9);
    expect(axis.widths.infuse! / axis.widths.pressurize!).toBeCloseTo(2, 9);
  });

  it('widens a column with its time', () => {
    let last = 0;
    for (const infuseTime of [10, 20, 30, 40]) {
      const w = width({ ...dark, infuseTime }, 'infuse');
      expect(w).toBeGreaterThan(last);
      last = w;
    }
    // Once every other column is at its minimum, the column has all the room there is.
    const most = GRAPH_WIDTH - 2 * MIN_COLUMN_UNITS - FLOW_MIN_UNITS;
    expect(width({ ...dark, infuseTime: 60 }, 'infuse')).toBeCloseTo(most, 9);
    expect(width({ ...dark, infuseTime: 127 }, 'infuse')).toBeCloseTo(most, 9);
  });

  it('never makes a column narrower than a finger, at any times', () => {
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
      expect(widths.infuse).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
      expect(widths.pressurize).toBeGreaterThanOrEqual(MIN_COLUMN_UNITS);
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
    expect(on.phases.map((c) => c.id)).toEqual([
      'fill',
      'infuse',
      'secondFill',
      'pressurize',
      'flow',
    ]);
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
    expect(curve.borders.filter((b) => b.detailOnly).map((b) => b.field)).toEqual([
      'pauseDuration',
    ]);
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
    const drags = Object.fromEntries(
      curve.levels.filter((l) => l.line === 'temperature').map((l) => [l.phase, l.drags]),
    );
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
    expect(labelled({ ...light, rampTemperature: 90 })).toEqual([
      'fillTemperature',
      'rampTemperature',
      'pourTemperature',
    ]);
  });

  it('keeps a column for a ramp of 0 s', () => {
    const curve = buildCurve({ ...light, rampTime: 0 });
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
      infuse: [
        'infusePressure',
        'infuseTime',
        'infuseWeight',
        'infuseTemperature',
        'infuseFlowLimit',
      ],
      secondFill: [
        'secondFillFlow',
        'secondFillExitPressure',
        'secondFillTemperature',
        'secondFillTime',
        'pauseDuration',
        'pauseExitFlow',
      ],
      pressurize: ['pourPressure', 'rampTime', 'rampTemperature'],
      flow: [
        'pourFlow',
        'pourEndFlow',
        'pourTime',
        'pourTemperature',
        'stopWeight',
        'pourPressureLimit',
      ],
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
