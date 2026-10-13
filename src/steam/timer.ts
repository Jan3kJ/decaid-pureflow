// The steam timer from the weight on the scale (spec 3.4): which mug stands there, how much
// milk is in it and how long that milk steams. Pure: no clock, no network, no storage.
import type { SteamSettings } from '../settings';

export type MugSize = 's' | 'm' | 'l';

export interface Mug {
  size: MugSize;
  /** g, empty */
  weight: number;
}

/**
 * DSx2's rule (spec 3.4): the size steps up when the weight is above that mug's weight plus
 * this share of one drink's milk. With 1, a larger mug is recognised once it holds more than
 * one drink's milk, and the calibration's 180 g is read right in each of the founder's mugs.
 */
export const MUG_STEP_SHARE = 1;

/** The three mugs of the settings, smallest first. */
export function mugs(settings: SteamSettings): Mug[] {
  return [
    { size: 's', weight: settings.mugSmall },
    { size: 'm', weight: settings.mugMedium },
    { size: 'l', weight: settings.mugLarge },
  ];
}

/**
 * The mug on the scale: the largest one whose step the weight is above, and the small one
 * below every step, also for an empty scale.
 */
export function detectMug(weight: number, settings: SteamSettings): Mug {
  const [small, ...larger] = mugs(settings);
  const step = MUG_STEP_SHARE * settings.milkPerDrink;
  return larger.reduce((found, mug) => (weight > mug.weight + step ? mug : found), small);
}

/** g of milk: the weight without the mug, never negative. */
export function milkWeight(weight: number, mug: Mug): number {
  return Math.max(0, weight - mug.weight);
}

/**
 * timer = reference seconds / reference milk grams x milk, in whole seconds, never negative.
 * A calibration without milk gives 0.
 */
export function timerSeconds(milk: number, settings: SteamSettings): number {
  if (!(settings.referenceMilk > 0)) return 0;
  return Math.max(0, Math.round((settings.referenceSeconds * milk) / settings.referenceMilk));
}

export interface SteamReading {
  mug: Mug;
  /** g */
  milk: number;
  /** whole seconds */
  seconds: number;
}

/** Everything the steam page shows for one scale weight. */
export function readScale(weight: number, settings: SteamSettings): SteamReading {
  const mug = detectMug(weight, settings);
  const milk = milkWeight(weight, mug);
  return { mug, milk, seconds: timerSeconds(milk, settings) };
}
