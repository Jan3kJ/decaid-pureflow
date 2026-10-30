// How long the next shot is expected to take: where the running shot graph's time
// axis starts, so a 50 s shot is not rescaled at 30, 40 and 50 s. Pure, except `lastShotSeconds`.
import type { Profile } from '../api';
import { drawnShotSeconds } from '../editor/curve';
import { readParams } from '../editor/storage';
import { seriesOf } from '../history/entries';
import type { ShotCache } from '../history/shots.svelte';
import { stepCurve } from '../steps/curve';
import { startSeconds } from '../graph/axis';

/**
 * s, a profile's own estimate of a shot: the A-Flow editor's drawn length for an A-Flow 3.0
 * profile (`drawnShotSeconds`), else the step editor's curve (`stepCurve`); null for a profile
 * without steps.
 */
export function profileSeconds(profile: Pick<Profile, 'notes' | 'steps' | 'target_weight'>): number | null {
  const params = readParams(profile);
  if (params) return drawnShotSeconds(params);
  const seconds = stepCurve(profile).seconds;
  return seconds > 0 ? seconds : null;
}

/**
 * s, where the running shot's time axis starts: the length of the last shot with the profile's
 * title, else the profile's estimate, else 30 s, rounded up to ten seconds (`startSeconds`).
 */
export function expectedShotSeconds(
  profile: Pick<Profile, 'notes' | 'steps' | 'target_weight'> | null | undefined,
  lastShot: number | null,
): number {
  if (lastShot !== null && lastShot > 0) return startSeconds(lastShot);
  return startSeconds(profile ? profileSeconds(profile) : null);
}

/**
 * s, the length of the newest shot the skin holds with this profile title (`ShotCache`), as
 * its graph draws it (`seriesOf`); null without one.
 */
export async function lastShotSeconds(shots: Pick<ShotCache, 'latestWithTitle' | 'record'>, title: string): Promise<number | null> {
  const latest = await shots.latestWithTitle(title);
  if (!latest) return null;
  const seconds = seriesOf(await shots.record(latest.id)).t.at(-1) ?? 0;
  return seconds > 0 ? seconds : null;
}
