import { describe, expect, it } from 'vitest';
import { decodeParams, encodeParams, parseParams, serializeParams } from './codec';
import { DEFAULT_PROFILES } from './defaults';
import type { AFlowParams } from './types';

const medium: AFlowParams = DEFAULT_PROFILES.find((p) => p.id === 'default-medium')!.params;

describe('serializeParams and parseParams', () => {
  it('reads back what was written, for every default profile and toggle state', () => {
    for (const { params } of DEFAULT_PROFILES) {
      for (const secondFill of [false, true]) {
        for (const flowUp of [false, true]) {
          const p = { ...params, flowUp, dose: 17.9, pauseDuration: secondFill ? 7 : 0 };
          expect(parseParams(serializeParams(p))).toEqual({ ok: true, params: p });
        }
      }
    }
  });

  it('reads back values that are set instead of following', () => {
    const p = {
      ...medium,
      infuseTemperature: 90,
      secondFillTemperature: 89.5,
      rampTemperature: 91,
      pourEndFlow: 0,
      pourPressureLimit: 7,
    };
    expect(parseParams(serializeParams(p))).toEqual({ ok: true, params: p });
  });

  it('writes a value that follows another one as null', () => {
    const written = JSON.parse(serializeParams(medium)).params;
    for (const field of ['infuseTemperature', 'secondFillTemperature', 'rampTemperature', 'pourEndFlow', 'pourPressureLimit']) {
      expect(written[field], field).toBeNull();
    }
  });

  it('has no key for the 2nd fill: the pause says it', () => {
    expect(Object.keys(JSON.parse(serializeParams(medium)).params)).not.toContain('secondFill');
  });

  // A clean break (2026-10-13): no 3.0 string was saved before the format changed.
  it('rejects the 3.0 string of 2026-10-12, which lacks the new values', () => {
    const old = {
      dose: 18,
      fillFlow: 8,
      fillTemperature: 93,
      infusePressure: 3,
      infuseTime: 60,
      infuseWeight: 3.6,
      secondFill: false,
      secondFillFlow: 8,
      pauseDuration: 15,
      pourPressure: 10,
      rampTime: 10,
      pourFlow: 2,
      pourTemperature: 93,
      stopWeight: 42,
      flowUp: true,
    };
    expect(parseParams(JSON.stringify({ aflow: '3.0', params: old }))).toEqual({
      ok: false,
      error: 'fillExitPressure is not a number',
    });
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
    expect(parseParams(JSON.stringify({ aflow: '3.0', params: { ...medium, pauseDuration: null } }))).toEqual({
      ok: false,
      error: 'pauseDuration is not a number',
    });
    const { pourEndFlow: _pourEndFlow, ...withoutEndFlow } = medium;
    expect(parseParams(JSON.stringify({ aflow: '3.0', params: withoutEndFlow }))).toEqual({
      ok: false,
      error: 'pourEndFlow is not a number or null',
    });
    expect(parseParams(JSON.stringify({ aflow: '3.0', params: { ...medium, flowUp: 1 } }))).toEqual({
      ok: false,
      error: 'flowUp is not true or false',
    });
  });

  // founder, 2026-10-13 (request 169): the pause's exit flow came after the first saved strings.
  it("reads a saved string without the pause's exit flow as 1 ml/s, the value that was fixed", () => {
    for (const { id, params } of DEFAULT_PROFILES) {
      const { pauseExitFlow: _pauseExitFlow, ...saved } = { ...params, pauseDuration: 12 };
      const text = JSON.stringify({ aflow: '3.0', params: saved });
      expect(parseParams(text), id).toEqual({ ok: true, params: { ...saved, pauseExitFlow: 1 } });
    }
  });

  it("writes the pause's exit flow after the pause time and reads it back", () => {
    const p = { ...medium, pauseDuration: 12, pauseExitFlow: 0.6 };
    const text = serializeParams(p);
    expect(text).toContain('"pauseDuration":12,"pauseExitFlow":0.6,');
    expect(JSON.parse(text).aflow).toBe('3.0');
    expect(parseParams(text)).toEqual({ ok: true, params: p });
  });

  it('rejects a pause exit flow that is there and is not a number', () => {
    for (const value of [null, '1']) {
      expect(parseParams(JSON.stringify({ aflow: '3.0', params: { ...medium, pauseExitFlow: value } }))).toEqual({
        ok: false,
        error: 'pauseExitFlow is not a number',
      });
    }
  });

  it('ignores unknown keys', () => {
    const text = JSON.stringify({ aflow: '3.0', params: { ...medium, later: 1 }, other: true });
    expect(parseParams(text)).toEqual({ ok: true, params: medium });
  });
});

describe('encodeParams and decodeParams (the record metadata)', () => {
  it('reads back what was written, after JSON as the gateway answers, the 2nd fill off with its own values too', () => {
    const off = { ...medium, pauseDuration: 0, secondFillFlow: 6.5, secondFillTemperature: 91.25, secondFillTime: 12 };
    for (const p of [medium, off]) {
      expect(decodeParams(encodeParams(p))).toEqual({ ok: true, params: p });
      expect(decodeParams(JSON.parse(JSON.stringify(encodeParams(p))))).toEqual({ ok: true, params: p });
    }
  });

  it('is the object of the string', () => {
    expect(JSON.stringify(encodeParams(medium))).toBe(serializeParams(medium));
    expect(encodeParams(medium).aflow).toBe('3.0');
  });

  it('reads a metadata object with other keys beside aflow and params', () => {
    const metadata = { source: 'pureflow', ...encodeParams(medium), other: [1, 'x'] };
    expect(decodeParams(metadata)).toEqual({ ok: true, params: medium });
  });

  it('refuses what is not the codec object', () => {
    expect(decodeParams(null).ok).toBe(false);
    expect(decodeParams(undefined).ok).toBe(false);
    expect(decodeParams([]).ok).toBe(false);
    expect(decodeParams('{"aflow":"3.0"}').ok).toBe(false);
    expect(decodeParams({ source: 'pureflow', aflow: '3.0' })).toEqual({ ok: false, error: 'no params' });
    expect(decodeParams({ source: 'bundled', filename: 'a.json' }).ok).toBe(false);
  });
});
