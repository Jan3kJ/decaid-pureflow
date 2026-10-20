import { describe, expect, it } from 'vitest';
import { fixedScale, inBand, shotScale, startSeconds, temperatureBand, timeAxis } from './axis';

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

describe('shotScale', () => {
  it('ends at 10 with a number every 2 while every value stays at or under 10', () => {
    expect(
      shotScale([
        [0, 9.4, 10],
        [8, 2.2],
        [null, 4.1],
        [9, null],
      ]),
    ).toEqual({ max: 10, ticks: [0, 2, 4, 6, 8, 10] });
    expect(shotScale([])).toEqual({ max: 10, ticks: [0, 2, 4, 6, 8, 10] });
    expect(shotScale([undefined, []]).max).toBe(10);
  });

  it('opens to 12 when one drawn value goes over 10: measured, weight flow or target', () => {
    const open = { max: 12, ticks: [0, 2, 4, 6, 8, 10, 12] };
    expect(shotScale([[9, 10.4], [2]])).toEqual(open);
    expect(shotScale([[9], [2], [null, 11]])).toEqual(open);
    expect(shotScale([[9], [2], undefined, [null, 10.5]])).toEqual(open);
    // A value over 12 is held at the top: the scale stays 12.
    expect(shotScale([[14]]).max).toBe(12);
  });

  it('has a number at every quarter of a fixed scale', () => {
    expect(fixedScale(4)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
  });
});

describe('startSeconds', () => {
  it('rounds the expected length up to ten seconds', () => {
    expect(startSeconds(27.7)).toBe(30);
    expect(startSeconds(50)).toBe(50);
    expect(startSeconds(50.2)).toBe(60);
    expect(startSeconds(4)).toBe(10);
  });

  it('is 30 s without an expected length', () => {
    for (const none of [null, undefined, 0, -3, Number.NaN]) expect(startSeconds(none)).toBe(30);
  });

  it('is where a running axis starts, and a shorter shot does not rescale it', () => {
    const start = startSeconds(54.3);
    for (const last of [0, 10, 30, 52, 60]) expect(timeAxis(last, false, start).seconds).toBe(60);
    expect(timeAxis(61, false, start).seconds).toBe(70);
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
