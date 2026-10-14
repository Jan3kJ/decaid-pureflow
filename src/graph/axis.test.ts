import { describe, expect, it } from 'vitest';
import { timeAxis } from './axis';

describe('timeAxis', () => {
  it('ends at the last sample of a stored shot, short or long', () => {
    expect(timeAxis(15, true)).toEqual({ seconds: 15, ticks: [0, 5, 10, 15] });
    expect(timeAxis(45, true)).toEqual({ seconds: 45, ticks: [0, 10, 20, 30, 40] });
    expect(timeAxis(27.3, true).seconds).toBe(27.3);
    // The last sample is at the right edge in both: its share of the axis is 1.
    for (const last of [15, 45]) expect(last / timeAxis(last, true).seconds).toBe(1);
  });

  it('grows in steps of ten seconds while a shot runs, from the minimum on', () => {
    expect(timeAxis(0, false).seconds).toBe(30);
    expect(timeAxis(15, false)).toEqual({ seconds: 30, ticks: [0, 10, 20, 30] });
    expect(timeAxis(30.1, false).seconds).toBe(40);
    expect(timeAxis(45, false)).toEqual({ seconds: 50, ticks: [0, 10, 20, 30, 40, 50] });
    expect(timeAxis(5, false, 60).seconds).toBe(60);
  });

  it('widens the steps of a long shot', () => {
    expect(timeAxis(90, true).ticks).toEqual([0, 20, 40, 60, 80]);
    expect(timeAxis(200, false).ticks).toEqual([0, 30, 60, 90, 120, 150, 180]);
  });

  it('has the running axis for a shot without a sample', () => {
    expect(timeAxis(0, true)).toEqual({ seconds: 30, ticks: [0, 10, 20, 30] });
  });
});
