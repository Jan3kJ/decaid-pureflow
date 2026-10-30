import { describe, expect, it } from 'vitest';
import type { MachineSnapshot } from '../api';
import {
  PREVIOUS_KEY,
  SENSORS,
  absolute,
  average,
  blocked,
  calibrationText,
  loadPrevious,
  measuredOf,
  preview,
  reading,
  savePrevious,
} from './sensor-calibration';

const sensor = (id: string) => SENSORS.find((entry) => entry.id === id)!;

describe('the sensor calibration', () => {
  it("has Streamline's three sensors: temperature an offset, pressure and flow ratios", () => {
    expect(SENSORS.map((entry) => [entry.id, entry.kind, entry.reading])).toEqual([
      ['temperature', 'offset', 'groupTemperature'],
      ['pressure', 'ratio', 'pressure'],
      ['flow', 'ratio', 'flow'],
    ]);
  });

  it("reads the sensor's own value, not the frame's target", () => {
    const frame = { pressure: 3.2, targetPressure: 9, flow: 2, groupTemperature: 92.5 } as MachineSnapshot;
    expect(reading(sensor('pressure'), frame)).toBe(3.2);
    expect(reading(sensor('temperature'), frame)).toBe(92.5);
    expect(reading(sensor('flow'), null)).toBeNull();
  });

  it('a capture is the mean of the last 5 s', () => {
    const samples = [
      { value: 100, at: 0 },
      { value: 2, at: 6000 },
      { value: 4, at: 9000 },
    ];
    expect(average(samples, 10_000)).toBe(3);
    expect(average(samples, 20_000)).toBeNull();
  });

  it("previews the firmware's arithmetic: a ratio multiplies, an offset adds", () => {
    expect(preview('ratio', 1.0, 2.0, 2.2)).toBeCloseTo(1.1);
    expect(preview('offset', 0.5, 92, 93)).toBeCloseTo(1.5);
    expect(preview('ratio', 1.0, 0, 2)).toBeNull();
  });

  it('refuses a capture of an idle machine, a measured zero and a ratio out by a third', () => {
    expect(blocked('ratio', 0, 2)).toMatch(/not running/);
    expect(blocked('offset', 0, 93)).toMatch(/not running/);
    expect(blocked('ratio', 2, 0)).toMatch(/zero/);
    expect(blocked('ratio', 2, 3)).toMatch(/1\.50 times/);
    expect(blocked('ratio', 2, 2.2)).toBe('');
    expect(blocked('offset', 92, 80)).toBe('');
  });

  it('restores an absolute value: both kinds land on it, twice changes nothing', () => {
    const { reported, measured } = absolute(1.1, 1.0);
    expect(preview('ratio', 1.1, reported, measured)).toBeCloseTo(1.0);
    expect(preview('offset', 1.1, reported, measured)).toBeCloseTo(1.0);
    const again = absolute(1.0, 1.0);
    expect(preview('ratio', 1.0, again.reported, again.measured)).toBe(1.0);
  });

  it("takes only what Decaid's Q16.16 holds, and writes a ratio with four places, an offset with a sign", () => {
    expect(measuredOf(2.5)).toBe(2.5);
    expect(measuredOf(40000)).toBeNull();
    expect(measuredOf(null)).toBeNull();
    expect(calibrationText('ratio', 1)).toBe('1.0000');
    expect(calibrationText('offset', 0.5)).toBe('+0.50 °C');
    expect(calibrationText('offset', -1)).toBe('-1.00 °C');
    expect(calibrationText('ratio', null)).toBe('–');
  });

  it('keeps the value before the last write by sensor, outside the settings', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(loadPrevious(storage)).toEqual({});
    savePrevious({ flow: 1.02 }, storage);
    expect(store.get(PREVIOUS_KEY)).toBe('{"flow":1.02}');
    expect(loadPrevious(storage)).toEqual({ flow: 1.02 });
    store.set(PREVIOUS_KEY, '{"flow":"x","pressure":0.98}');
    expect(loadPrevious(storage)).toEqual({ pressure: 0.98 });
    store.set(PREVIOUS_KEY, 'not json');
    expect(loadPrevious(storage)).toEqual({});
  });
});
