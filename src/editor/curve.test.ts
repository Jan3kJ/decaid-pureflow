import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, paramRanges, validateParams, type AFlowParams } from '../aflow';
import {
  GRAPH_WIDTH,
  buildCurve,
  hitTest,
  secondsToUnits,
  unitsToSeconds,
  type Projection,
} from './curve';
import { FIELD_STEP, PHASE_FIELDS, formatValue, snap } from './fields';

const light: AFlowParams = DEFAULT_PROFILES.find((p) => p.id === 'default-light')!.params;
const withSecondFill: AFlowParams = { ...light, secondFill: true };

describe('secondsToUnits', () => {
  it('grows with the duration over the whole range', () => {
    let last = -1;
    for (const s of [0, 1, 5, 10, 11, 30, 60, 61, 500, 1000]) {
      expect(secondsToUnits(s)).toBeGreaterThan(last);
      last = secondsToUnits(s);
    }
  });

  it('is undone by unitsToSeconds', () => {
    for (const s of [0, 3, 10, 25, 60, 240, 1000]) {
      expect(unitsToSeconds(secondsToUnits(s))).toBeCloseTo(s, 6);
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

  it('puts every border on the right edge of its phase', () => {
    const curve = buildCurve(withSecondFill);
    for (const border of curve.borders) {
      expect(border.x).toBe(curve.phases.find((c) => c.id === border.phase)!.x1);
    }
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

  it('has a level or a border for every value a drag can change, each once', () => {
    const curve = buildCurve(withSecondFill);
    const fields = [...curve.levels.map((l) => l.field), ...curve.borders.map((b) => b.field)];
    expect(new Set(fields).size).toBe(fields.length);
    expect([...fields].sort()).toEqual(
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

  it('runs every line left to right over the whole graph', () => {
    for (const { params } of DEFAULT_PROFILES) {
      for (const secondFill of [false, true]) {
        const curve = buildCurve({ ...params, secondFill });
        for (const line of [curve.flow, curve.pressure, curve.temperature]) {
          expect(line[0].x).toBe(0);
          expect(line.at(-1)!.x).toBe(GRAPH_WIDTH);
          for (let i = 1; i < line.length; i++) {
            expect(line[i].x).toBeGreaterThanOrEqual(line[i - 1].x);
          }
        }
      }
    }
  });

  it('ramps the pressure to the pour pressure over the pressurize column', () => {
    const curve = buildCurve(light);
    const pressurize = curve.phases.find((c) => c.id === 'pressurize')!;
    const start = curve.pressure.filter((pt) => pt.x === pressurize.x0).at(-1)!;
    const end = curve.pressure.find((pt) => pt.x === pressurize.x1)!;
    expect(start.y).toBe(light.infusePressure);
    expect(end.y).toBe(light.pourPressure);
  });

  it('lets the pour flow rise with flow up and fall with flow down', () => {
    const up = buildCurve({ ...light, flowUp: true });
    const down = buildCurve({ ...light, flowUp: false });
    expect(up.flow.at(-1)!.y).toBeGreaterThan(light.pourFlow);
    expect(down.flow.at(-1)!.y).toBeLessThan(light.pourFlow);
    expect(down.flow.at(-1)!.y).toBeGreaterThanOrEqual(0);
  });

  it('steps the temperature where the ramp begins', () => {
    const curve = buildCurve({ ...light, fillTemperature: 95, pourTemperature: 88 });
    const pressurize = curve.phases.find((c) => c.id === 'pressurize')!;
    expect(curve.temperature.map((pt) => pt.y)).toEqual([95, 95, 88, 88]);
    expect(curve.temperature[1].x).toBe(pressurize.x0);
  });

  it('widens a column with its duration and moves the borders after it', () => {
    const short = buildCurve({ ...light, infuseTime: 10 });
    const long = buildCurve({ ...light, infuseTime: 30 });
    expect(long.borders[0].x).toBeGreaterThan(short.borders[0].x);
    expect(long.borders[1].x).toBeGreaterThan(short.borders[1].x);
    expect(long.phases[0]).toEqual(short.phases[0]);
  });

  it('keeps every column on the graph at the longest durations', () => {
    const curve = buildCurve({
      ...withSecondFill,
      infuseTime: 1000,
      pauseDuration: 1000,
      rampTime: 1000,
    });
    expect(curve.scale).toBeLessThan(1);
    const pour = curve.phases.at(-1)!;
    expect(pour.x1).toBe(GRAPH_WIDTH);
    expect(pour.x1 - pour.x0).toBeGreaterThan(5);
  });

  it('keeps a column for a ramp of 0 s', () => {
    const curve = buildCurve({ ...light, rampTime: 0 });
    const pressurize = curve.phases.find((c) => c.id === 'pressurize')!;
    expect(pressurize.x1 - pressurize.x0).toBeGreaterThan(5);
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
    const end = curve.flow.at(-1)!;
    const hit = hitTest(curve, pour.x1 * 10 - 1, 1000 - end.y * 20, projection, 5, 0);
    expect(hit).toMatchObject({ kind: 'level', level: { field: 'pourFlow' } });
  });

  it('takes a border away from any line', () => {
    const hit = hitTest(curve, infuse.x1 * 10 + 10, 600, projection, 28, 22);
    expect(hit).toMatchObject({ kind: 'border', border: { field: 'infuseTime' } });
  });

  it('takes nothing in empty space', () => {
    expect(hitTest(curve, midInfuse, 600, projection, 28, 22)).toBeNull();
  });

  it('takes the temperature line in its own band', () => {
    const hit = hitTest(curve, midInfuse, (105 - light.fillTemperature) * 20 - 5, projection, 28, 22);
    expect(hit).toMatchObject({ kind: 'level', level: { field: 'fillTemperature' } });
  });
});

describe('fields', () => {
  it('snaps into the generator range, on the step', () => {
    const ranges = paramRanges();
    expect(snap('pourPressure', 99)).toBe(ranges.pourPressure.max);
    expect(snap('pourFlow', -3)).toBe(ranges.pourFlow.min);
    expect(snap('fillTemperature', 93.26)).toBe(93.5);
    expect(snap('infuseTime', 12.4)).toBe(12);
    expect(snap('infusePressure', 3.04999)).toBe(3);
    expect(snap('dose', 18.1 + 0.1)).toBe(18.2);
  });

  it('gives valid parameters after any number of steps', () => {
    let params = { ...light };
    for (const field of Object.keys(FIELD_STEP) as (keyof typeof FIELD_STEP)[]) {
      for (let i = 0; i < 37; i++) {
        params = { ...params, [field]: snap(field, params[field] + FIELD_STEP[field]) };
      }
      for (let i = 0; i < 11; i++) {
        params = { ...params, [field]: snap(field, params[field] - FIELD_STEP[field]) };
      }
    }
    expect(validateParams(params)).toEqual([]);
  });

  it('lists every value of spec 3.2 but the dose under one phase', () => {
    const listed = Object.values(PHASE_FIELDS).flat();
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed, 'dose'].sort()).toEqual(Object.keys(FIELD_STEP).sort());
  });

  it('formats a value with its unit', () => {
    expect(formatValue('pourPressure', 9.5)).toBe('9.5 bar');
    expect(formatValue('pourFlow', 2)).toBe('2 ml/s');
    expect(formatValue('infuseTime', 60)).toBe('60 s');
    expect(formatValue('fillTemperature', 93)).toBe('93 °C');
  });
});
