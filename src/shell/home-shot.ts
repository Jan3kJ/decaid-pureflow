// What home's graph and right column show: home is the shot screen. Pure: the
// shot, the recalled history entry's series, the newest shot record's series and the scale's
// weight in, one choice out.
import { DETERGENT_TITLE, type Stage } from '../settings-page/detergent';
import { emptySeries, lastShotWeight, seriesWeight, shotSeconds, type Shot, type ShotSeries } from './shot';

export type HomeShotKind = 'running' | 'finished' | 'recalled' | 'none';

export interface HomeShot {
  kind: HomeShotKind;
  /** what the graph draws */
  series: ShotSeries;
  /** s, the column's time; null before any shot ('–') */
  seconds: number | null;
  /** g, the column's weight; null without one ('–') */
  weight: number | null;
}

/**
 * A running shot comes first, live, with the scale's weight. Then a recalled history entry:
 * it was tapped after the last shot, so it lies over it until it is dismissed, and the
 * finished shot is back. Then the finished shot, which stays until the next one starts. Then
 * the newest shot record read from Decaid (`wantsNewest`), shown as the finished shot without
 * its table. Else nothing: the empty graph.
 */
export function homeShot(
  shot: Shot | null,
  recalled: ShotSeries | null,
  weight: number | null,
  newest: ShotSeries | null = null,
): HomeShot {
  if (shot && !shot.ended) return { kind: 'running', series: shot.series, seconds: shotSeconds(shot), weight };
  if (recalled) return { kind: 'recalled', series: recalled, seconds: recalled.t.at(-1) ?? 0, weight: seriesWeight(recalled) };
  if (shot) return { kind: 'finished', series: shot.series, seconds: shotSeconds(shot), weight: lastShotWeight(shot, null) };
  if (newest) return { kind: 'finished', series: newest, seconds: newest.t.at(-1) ?? 0, weight: lastShotWeight(null, newest) };
  return { kind: 'none', series: emptySeries(), seconds: null, weight: null };
}

/**
 * Whether home reads the newest shot record from Decaid: at the start, a reconnect, the
 * machine's wake and the page becoming visible again, when it has no shot of its own, neither
 * a running or kept one nor a recalled history entry. A page the tablet reloaded has none. The
 * newest record read before is read again, since a shot may have been made meanwhile.
 */
export function wantsNewest(shot: Shot | null, recalled: ShotSeries | null): boolean {
  return shot === null && recalled === null;
}

/**
 * Whether a run of the workflow's profile is the clean with detergent's first step, which home
 * does not take as a shot: the profile is the detergent profile and the procedure has begun and
 * is not over. A frame that comes before the procedure has seen the start (it is busy with its
 * load) counts as the run, since only the run starts with this profile loaded. The last real
 * shot stays on home.
 */
export function isDetergentRun(title: string | undefined, stage: Stage): boolean {
  return title === DETERGENT_TITLE && stage !== 'idle' && stage !== 'done';
}
