import { describe, expect, it } from 'vitest';
import { inBand, temperatureBand, timeAxis } from './axis';

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

describe('temperatureBand', () => {
  it('is 80 to 100 °C and opens in steps of ten for the values', () => {
    expect(temperatureBand([])).toEqual({ min: 80, max: 100 });
    expect(temperatureBand([92, 93])).toEqual({ min: 80, max: 100 });
    expect(temperatureBand([74, 103])).toEqual({ min: 70, max: 110 });
  });

  it("is the steam page's 140 to 170 °C whatever the values (spec 3.7), and holds them inside", () => {
    const steam = { min: 140, max: 170 };
    expect(temperatureBand([95, 152, 181], steam)).toEqual(steam);
    expect([95, 152, 181].map((value) => inBand(value, steam))).toEqual([140, 152, 170]);
  });
});
