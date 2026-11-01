// A two-finger swipe down on hot water, home or steam: the menu's 'Machine and app sleep'. Pure:
// the fingers' positions in, a decision out. Both fingers must go down within `TWO_WINDOW` ms of each
// other, and both must travel down `TWO_DISTANCE` of the height, each more down than across.
import type { Point } from './swipe';

/** Each finger goes down this share of the screen's height. */
export const TWO_DISTANCE = 0.15;
/** The second finger goes down within this many milliseconds of the first. */
export const TWO_WINDOW = 400;

export interface Finger {
  start: Point;
  now: Point;
}

/** Whether `finger` moved down by the distance and mostly down. */
function down(finger: Finger, height: number): boolean {
  const dy = finger.now.y - finger.start.y;
  return dy >= height * TWO_DISTANCE && dy > 2 * Math.abs(finger.now.x - finger.start.x);
}

/** Whether two fingers that went down `apart` ms from each other have swiped down. */
export function twoFingerDown(a: Finger, b: Finger, apart: number, height: number): boolean {
  return apart <= TWO_WINDOW && down(a, height) && down(b, height);
}
