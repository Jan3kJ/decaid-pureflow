import { describe, expect, it } from 'vitest';
import { parseParams, serializeParams } from './codec';
import { DEFAULT_PROFILES } from './defaults';
import type { AFlowParams } from './types';

const medium: AFlowParams = DEFAULT_PROFILES[1].params;

describe('serializeParams and parseParams', () => {
  it('reads back what was written, for every default profile and toggle state', () => {
    for (const { params } of DEFAULT_PROFILES) {
      for (const secondFill of [false, true]) {
        for (const flowUp of [false, true]) {
          const p = { ...params, secondFill, flowUp, dose: 17.9, pauseDuration: 7 };
          expect(parseParams(serializeParams(p))).toEqual({ ok: true, params: p });
        }
      }
    }
  });

  it('writes the version 3.0', () => {
    expect(JSON.parse(serializeParams(medium))).toEqual({ aflow: '3.0', params: medium });
  });

  it('writes the same string whatever the key order of the input', () => {
    const reversed = Object.fromEntries(Object.entries(medium).reverse()) as unknown as AFlowParams;
    expect(serializeParams(reversed)).toBe(serializeParams(medium));
  });

  it('does not carry anything that is not a parameter', () => {
    const extra = { ...medium, firstStepWorkaround: true } as AFlowParams;
    expect(serializeParams(extra)).toBe(serializeParams(medium));
  });

  it('rejects text that is not an A-Flow 3.0 string', () => {
    expect(parseParams('A-Flow: an alternative profile for D-Flow')).toEqual({ ok: false, error: 'not JSON' });
    expect(parseParams('null').ok).toBe(false);
    expect(parseParams('{}').ok).toBe(false);
    expect(parseParams(JSON.stringify({ aflow: '3.0' }))).toEqual({ ok: false, error: 'no params' });
  });

  it('rejects another version', () => {
    const other = serializeParams(medium).replace('"3.0"', '"2.0"');
    expect(parseParams(other)).toEqual({ ok: false, error: 'not A-Flow 3.0: version "2.0"' });
  });

  it('rejects a missing value or one of the wrong type', () => {
    const { rampTime: _rampTime, ...withoutRamp } = medium;
    expect(parseParams(JSON.stringify({ aflow: '3.0', params: withoutRamp }))).toEqual({
      ok: false,
      error: 'rampTime is not a number',
    });
    expect(parseParams(JSON.stringify({ aflow: '3.0', params: { ...medium, dose: '18' } }))).toEqual({
      ok: false,
      error: 'dose is not a number',
    });
    expect(parseParams(JSON.stringify({ aflow: '3.0', params: { ...medium, flowUp: 1 } }))).toEqual({
      ok: false,
      error: 'flowUp is not true or false',
    });
  });

  it('ignores unknown keys', () => {
    const text = JSON.stringify({ aflow: '3.0', params: { ...medium, later: 1 }, other: true });
    expect(parseParams(text)).toEqual({ ok: true, params: medium });
  });
});
