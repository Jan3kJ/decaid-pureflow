// The steam timer from the weight on the scale: which mug stands there, how much
// milk is in it and how long that milk steams. Pure: no clock, no network, no storage.
import type { SteamSettings } from '../settings';

export type MugSize = 's' | 'm' | 'l';

export interface Mug {
  size: MugSize;
  /** g, empty */
  weight: number;
}

/** The three mugs of the settings, smallest first. */
export function mugs(settings: SteamSettings): Mug[] {
  return [
    { size: 's', weight: settings.mugSmall },
    { size: 'm', weight: settings.mugMedium },
    { size: 'l', weight: settings.mugLarge },
  ];
}

/**
 * The weights the size steps up above: the midpoint between
 * two full mugs, a mug of size n holding n drinks. With the defaults 412.5 g and 625 g.
 */
export function mugSteps(settings: SteamSettings): { medium: number; large: number } {
  const drink = settings.milkPerDrink;
  const full = [settings.mugSmall + drink, settings.mugMedium + 2 * drink, settings.mugLarge + 3 * drink];
  return { medium: (full[0] + full[1]) / 2, large: (full[1] + full[2]) / 2 };
}

/**
 * The mug on the scale: the largest one whose step the weight is above, and the small one
 * below every step, also for an empty scale.
 */
export function detectMug(weight: number, settings: SteamSettings): Mug {
  const [small, medium, large] = mugs(settings);
  const steps = mugSteps(settings);
  if (weight > steps.large) return large;
  return weight > steps.medium ? medium : small;
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

/** s, the machine's steam timer is one byte */
export const TIMER_MAX = 255;

/**
 * The seconds sent for a timer with an adjust button's amount: the calculated
 * timer or a favourite plus the amount, whole seconds from 1 to 255. No amount (null) leaves
 * the seconds as they are; a timer of 0, an empty scale, stays 0.
 */
export function adjustedSeconds(seconds: number, amount: number | null): number {
  if (seconds <= 0) return 0;
  return Math.min(TIMER_MAX, Math.max(1, Math.round(seconds + (amount ?? 0))));
}
