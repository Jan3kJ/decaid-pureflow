import { describe, expect, it } from 'vitest';
import { DEFAULT_STEAM_SETTINGS, type SteamSettings } from '../settings';
import { adjustedSeconds, detectMug, milkWeight, mugSteps, mugs, readScale, timerSeconds } from './timer';

const settings = DEFAULT_STEAM_SETTINGS;
const size = (weight: number, from: SteamSettings = settings) => detectMug(weight, from).size;

describe('mug detection', () => {
  it('lists the three mugs of the settings, smallest first', () => {
    expect(mugs(settings)).toEqual([
      { size: 's', weight: 150 },
      { size: 'm', weight: 225 },
      { size: 'l', weight: 275 },
    ]);
  });

  it('steps up at the midpoints between two full mugs, 412.5 g and 625 g with the defaults', () => {
    // ((150 + 150) + (225 + 300)) / 2 and ((225 + 300) + (275 + 450)) / 2
    expect(mugSteps(settings)).toEqual({ medium: 412.5, large: 625 });
    expect(size(412.4)).toBe('s');
    expect(size(412.5)).toBe('s');
    expect(size(412.6)).toBe('m');
    expect(size(624.9)).toBe('m');
    expect(size(625)).toBe('m');
    expect(size(625.1)).toBe('l');
  });

  it('is the small mug below every step: an empty scale, an empty mug, a negative weight', () => {
    for (const weight of [-3, 0, 12, 150, 225, 275, 330, 412]) expect(size(weight)).toBe('s');
  });

  it('is the large mug for everything above its step', () => {
    for (const weight of [626, 800, 2000]) expect(size(weight)).toBe('l');
  });

  it('reads a full mug right: a mug of size n with n drinks of milk', () => {
    mugs(settings).forEach((mug, i) => {
      expect(detectMug(mug.weight + (i + 1) * settings.milkPerDrink, settings)).toEqual(mug);
    });
  });

  it('follows the settings', () => {
    const other: SteamSettings = { ...settings, mugSmall: 100, mugMedium: 300, mugLarge: 500, milkPerDrink: 100 };
    // ((100 + 100) + (300 + 200)) / 2 = 350, ((300 + 200) + (500 + 300)) / 2 = 650
    expect(mugSteps(other)).toEqual({ medium: 350, large: 650 });
    expect(size(350, other)).toBe('s');
    expect(size(350.1, other)).toBe('m');
    expect(size(650, other)).toBe('m');
    expect(size(650.1, other)).toBe('l');
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
    expect(readScale(525, settings)).toEqual({ mug: { size: 'm', weight: 225 }, milk: 300, seconds: 43 });
    expect(readScale(725, settings)).toEqual({ mug: { size: 'l', weight: 275 }, milk: 450, seconds: 65 });
  });

  it('gives no milk and no seconds for an empty scale', () => {
    expect(readScale(0, settings)).toEqual({ mug: { size: 's', weight: 150 }, milk: 0, seconds: 0 });
    expect(readScale(-1.2, settings).seconds).toBe(0);
  });
});

describe('the adjust buttons', () => {
  it('add their amount to the calculated timer', () => {
    // A medium mug with 300 g of milk: 43 s with the defaults.
    const { seconds } = readScale(525, settings);
    expect(seconds).toBe(43);
    expect(settings.adjustments.map((amount) => adjustedSeconds(seconds, amount))).toEqual([35, 39, 48]);
  });

  it('add their amount to a favourite', () => {
    expect(settings.favourites.map((seconds) => adjustedSeconds(seconds, 5))).toEqual([30, 55, 35]);
    expect(settings.favourites.map((seconds) => adjustedSeconds(seconds, -8))).toEqual([17, 42, 22]);
  });

  it('leave the seconds as they are when none is selected', () => {
    expect(adjustedSeconds(43, null)).toBe(43);
    expect(adjustedSeconds(43, 0)).toBe(43);
  });

  it('keep the timer between 1 and 255 s, and an empty scale at 0', () => {
    expect(adjustedSeconds(5, -8)).toBe(1);
    expect(adjustedSeconds(253, 5)).toBe(255);
    expect(adjustedSeconds(0, 5)).toBe(0);
  });
});
