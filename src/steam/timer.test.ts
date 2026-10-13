import { describe, expect, it } from 'vitest';
import { DEFAULT_STEAM_SETTINGS, type SteamSettings } from '../settings';
import { MUG_STEP_SHARE, detectMug, milkWeight, mugs, readScale, timerSeconds } from './timer';

const settings = DEFAULT_STEAM_SETTINGS;
const step = MUG_STEP_SHARE * settings.milkPerDrink;
const size = (weight: number, from: SteamSettings = settings) => detectMug(weight, from).size;

describe('mug detection', () => {
  it('lists the three mugs of the settings, smallest first', () => {
    expect(mugs(settings)).toEqual([
      { size: 's', weight: 150 },
      { size: 'm', weight: 225 },
      { size: 'l', weight: 275 },
    ]);
  });

  it('steps up above a mug\'s weight plus the share of one drink\'s milk', () => {
    // The borders with the founder's defaults: 225 + 150 and 275 + 150 with a share of 1.
    expect(225 + step).toBe(375);
    expect(275 + step).toBe(425);
    expect(size(375)).toBe('s');
    expect(size(375.1)).toBe('m');
    expect(size(425)).toBe('m');
    expect(size(425.1)).toBe('l');
  });

  it('is the small mug below every step: an empty scale, an empty mug, a negative weight', () => {
    for (const weight of [-3, 0, 12, 150, 225, 275, 330]) expect(size(weight)).toBe('s');
  });

  it('is the large mug for everything above its step', () => {
    for (const weight of [426, 600, 2000]) expect(size(weight)).toBe('l');
  });

  it('reads the calibration\'s milk right in each mug', () => {
    for (const mug of mugs(settings)) {
      expect(detectMug(mug.weight + settings.referenceMilk, settings)).toEqual(mug);
    }
  });

  it('follows the settings', () => {
    const other: SteamSettings = { ...settings, mugSmall: 100, mugMedium: 300, mugLarge: 500, milkPerDrink: 100 };
    const otherStep = MUG_STEP_SHARE * 100;
    expect(size(300 + otherStep, other)).toBe('s');
    expect(size(300 + otherStep + 1, other)).toBe('m');
    expect(size(500 + otherStep, other)).toBe('m');
    expect(size(500 + otherStep + 1, other)).toBe('l');
    expect(detectMug(700, other).weight).toBe(500);
  });
});

describe('the milk', () => {
  it('is the weight without the mug', () => {
    expect(milkWeight(330, { size: 's', weight: 150 })).toBe(180);
    expect(milkWeight(405.5, { size: 'm', weight: 225 })).toBeCloseTo(180.5);
  });

  it('is never negative', () => {
    expect(milkWeight(0, { size: 's', weight: 150 })).toBe(0);
    expect(milkWeight(-2.5, { size: 's', weight: 150 })).toBe(0);
  });
});

describe('the timer', () => {
  it('is reference seconds / reference milk x milk', () => {
    expect(timerSeconds(180, settings)).toBe(26);
    expect(timerSeconds(360, settings)).toBe(52);
    expect(timerSeconds(90, settings)).toBe(13);
    expect(timerSeconds(0, settings)).toBe(0);
  });

  it('is rounded to whole seconds', () => {
    // 26 / 180 = 0.1444 s per gram
    expect(timerSeconds(150, settings)).toBe(22); // 21.67
    expect(timerSeconds(100, settings)).toBe(14); // 14.44
    expect(timerSeconds(45, settings)).toBe(7); // 6.5
    expect(timerSeconds(3, settings)).toBe(0); // 0.43
  });

  it('is never negative and survives a calibration without milk', () => {
    expect(timerSeconds(-50, settings)).toBe(0);
    expect(timerSeconds(180, { ...settings, referenceMilk: 0 })).toBe(0);
  });

  it('follows the calibration', () => {
    expect(timerSeconds(200, { ...settings, referenceSeconds: 30, referenceMilk: 100 })).toBe(60);
  });
});

describe('a scale weight', () => {
  it('gives the mug, the milk and the seconds', () => {
    expect(readScale(300, settings)).toEqual({ mug: { size: 's', weight: 150 }, milk: 150, seconds: 22 });
    expect(readScale(405, settings)).toEqual({ mug: { size: 'm', weight: 225 }, milk: 180, seconds: 26 });
    expect(readScale(575, settings)).toEqual({ mug: { size: 'l', weight: 275 }, milk: 300, seconds: 43 });
  });

  it('gives no milk and no seconds for an empty scale', () => {
    expect(readScale(0, settings)).toEqual({ mug: { size: 's', weight: 150 }, milk: 0, seconds: 0 });
    expect(readScale(-1.2, settings).seconds).toBe(0);
  });
});
