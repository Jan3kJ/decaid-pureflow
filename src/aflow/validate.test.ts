import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES } from './defaults';
import type { AFlowParams } from './types';
import { paramRanges, validateParams } from './validate';

const valid: AFlowParams = DEFAULT_PROFILES.find((p) => p.id === 'default-medium')!.params;

const codes = (change: Partial<AFlowParams>, limits?: { maxPressure: number; maxFlow: number }) =>
  validateParams({ ...valid, ...change }, limits).map((p) => `${p.field}:${p.code}`);

describe('validateParams', () => {
  it('finds nothing in valid parameters', () => {
    expect(validateParams(valid)).toEqual([]);
  });

  it('accepts the ends of every range', () => {
    const ranges = paramRanges();
    for (const [field, { min, max }] of Object.entries(ranges)) {
      expect(codes({ [field]: min }), `${field} min`).toEqual([]);
      expect(codes({ [field]: max }), `${field} max`).toEqual([]);
    }
  });

  it('every temperature is 50 to 105 °C (founder, 2026-10-12)', () => {
    const fields = ['fillTemperature', 'infuseTemperature', 'secondFillTemperature', 'rampTemperature', 'pourTemperature'] as const;
    for (const field of fields) {
      expect(paramRanges()[field]).toEqual({ min: 50, max: 105, unit: '°C' });
      expect(codes({ [field]: 50 })).toEqual([]);
      expect(codes({ [field]: 49.9 })).toEqual([`${field}:below-min`]);
      expect(codes({ [field]: 105 })).toEqual([]);
      expect(codes({ [field]: 105.1 })).toEqual([`${field}:above-max`]);
    }
    const temperatures = Object.entries(paramRanges()).filter(([, r]) => r.unit === '°C');
    expect(temperatures.map(([field]) => field).sort()).toEqual([...fields].sort());
  });

  it('every time is 0 to 127 s, one profile step each (founder, 2026-10-12)', () => {
    const fields = ['fillTime', 'infuseTime', 'secondFillTime', 'pauseDuration', 'rampTime', 'pourTime'] as const;
    for (const field of fields) {
      expect(paramRanges()[field]).toEqual({ min: 0, max: 127, unit: 's' });
      expect(codes({ [field]: 0 })).toEqual([]);
      expect(codes({ [field]: -1 })).toEqual([`${field}:below-min`]);
      expect(codes({ [field]: 127 })).toEqual([]);
      expect(codes({ [field]: 127.5 })).toEqual([`${field}:above-max`]);
    }
    const times = Object.entries(paramRanges()).filter(([, r]) => r.unit === 's');
    expect(times.map(([field]) => field).sort()).toEqual([...fields].sort());
  });

  it('the flow the pause ends under has the range of the other flows (founder, 2026-10-13)', () => {
    expect(paramRanges().pauseExitFlow).toEqual(paramRanges().secondFillFlow);
    expect(paramRanges().pauseExitFlow).toEqual({ min: 0.1, max: 8, unit: 'ml/s' });
    expect(codes({ pauseExitFlow: 1 })).toEqual([]);
    expect(codes({ pauseExitFlow: 0 })).toEqual(['pauseExitFlow:below-min']);
    expect(codes({ pauseExitFlow: 8.1 })).toEqual(['pauseExitFlow:above-max']);
    expect(paramRanges({ maxPressure: 12, maxFlow: 6 }).pauseExitFlow.max).toBe(6);
  });

  it('a value that follows another one may be null, the others may not', () => {
    const following = { infuseTemperature: null, secondFillTemperature: null, rampTemperature: null, pourEndFlow: null, pourPressureLimit: null };
    expect(codes(following)).toEqual([]);
    expect(codes({ fillTemperature: null } as unknown as Partial<AFlowParams>)).toEqual([
      'fillTemperature:not-a-number',
    ]);
    expect(codes({ pauseDuration: null } as unknown as Partial<AFlowParams>)).toEqual([
      'pauseDuration:not-a-number',
    ]);
  });

  it('the move-on pressures and the max pressure are 0 to the maximum pressure', () => {
    for (const field of ['fillExitPressure', 'secondFillExitPressure', 'pourPressureLimit'] as const) {
      expect(codes({ [field]: 0 })).toEqual([]);
      expect(codes({ [field]: -0.1 })).toEqual([`${field}:below-min`]);
      expect(codes({ [field]: 12.1 })).toEqual([`${field}:above-max`]);
    }
  });

  it('the flow limit and the end flow may be 0, a pump flow may not', () => {
    for (const field of ['infuseFlowLimit', 'pourEndFlow'] as const) {
      expect(codes({ [field]: 0 })).toEqual([]);
      expect(codes({ [field]: -0.1 })).toEqual([`${field}:below-min`]);
      expect(codes({ [field]: 8.1 })).toEqual([`${field}:above-max`]);
    }
    expect(codes({ fillFlow: 0 })).toEqual(['fillFlow:below-min']);
  });

  it('weights are 0 to 1000 g', () => {
    expect(codes({ infuseWeight: -0.1 })).toEqual(['infuseWeight:below-min']);
    expect(codes({ stopWeight: 1000.5 })).toEqual(['stopWeight:above-max']);
  });

  it('the dose is 0 to 30 g in steps of 0.1', () => {
    expect(codes({ dose: 30.1 })).toEqual(['dose:above-max']);
    expect(codes({ dose: -0.1 })).toEqual(['dose:below-min']);
    expect(codes({ dose: 18.05 })).toEqual(['dose:off-step']);
    // 0.1 steps that are not exact in binary
    for (const dose of [0.3, 17.9, 18.1, 29.7]) expect(codes({ dose })).toEqual([]);
  });

  it('pressures and flows go up to the machine\'s maximum', () => {
    expect(codes({ infusePressure: 12.1 })).toEqual(['infusePressure:above-max']);
    expect(codes({ pourPressure: -1 })).toEqual(['pourPressure:below-min']);
    expect(codes({ fillFlow: 8.1 })).toEqual(['fillFlow:above-max']);
    expect(codes({ pourFlow: 0 })).toEqual(['pourFlow:below-min']);
    expect(codes({ secondFillFlow: 9 })).toEqual(['secondFillFlow:above-max']);
  });

  it('takes the machine\'s maxima as an argument', () => {
    const limits = { maxPressure: 10, maxFlow: 6 };
    expect(codes({}, limits)).toEqual(['fillFlow:above-max', 'secondFillFlow:above-max']);
    expect(codes({ fillFlow: 6, secondFillFlow: 6, pourPressure: 10.5 }, limits)).toEqual([
      'pourPressure:above-max',
    ]);
  });

  it('reports values of the wrong type and every problem at once', () => {
    const broken = {
      ...valid,
      dose: Number.NaN,
      rampTime: '10',
      rampTemperature: '90',
      flowUp: 'yes',
      stopWeight: 2000,
    } as unknown as AFlowParams;
    expect(validateParams(broken).map((p) => `${p.field}:${p.code}`)).toEqual([
      'dose:not-a-number',
      'rampTime:not-a-number',
      'rampTemperature:not-a-number',
      'stopWeight:above-max',
      'flowUp:not-a-boolean',
    ]);
    expect(validateParams(broken).every((p) => p.message.includes(p.field))).toBe(true);
  });
});
