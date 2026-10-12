import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES } from './defaults';
import type { AFlowParams } from './types';
import { paramRanges, validateParams } from './validate';

const valid: AFlowParams = DEFAULT_PROFILES[1].params;

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

  it('temperatures are 80 to 105 °C', () => {
    expect(codes({ fillTemperature: 79.9 })).toEqual(['fillTemperature:below-min']);
    expect(codes({ pourTemperature: 105.1 })).toEqual(['pourTemperature:above-max']);
  });

  it('times are 0 to 1000 s', () => {
    expect(codes({ infuseTime: -1 })).toEqual(['infuseTime:below-min']);
    expect(codes({ pauseDuration: 1001 })).toEqual(['pauseDuration:above-max']);
    expect(codes({ rampTime: 1001 })).toEqual(['rampTime:above-max']);
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
      flowUp: 'yes',
      stopWeight: 2000,
    } as unknown as AFlowParams;
    expect(validateParams(broken).map((p) => `${p.field}:${p.code}`)).toEqual([
      'dose:not-a-number',
      'rampTime:not-a-number',
      'stopWeight:above-max',
      'flowUp:not-a-boolean',
    ]);
    expect(validateParams(broken).every((p) => p.message.includes(p.field))).toBe(true);
  });
});
