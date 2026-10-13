// The gesture that opens the shot history (spec 3.1): a swipe from left to right that
// starts near the left edge. Pure: positions in, yes or no out.

export interface Point {
  x: number;
  y: number;
}

/** A swipe starts in this share of the width from the left edge: home has no button there but the tab. */
export const SWIPE_EDGE = 0.2;
/** It opens the history after this share of the width. */
export const SWIPE_DISTANCE = 0.06;

/** Whether a touch that went down at `start` may become the opening swipe. */
export function startsAtEdge(start: Point, width: number): boolean {
  return start.x <= width * SWIPE_EDGE;
}

/** Whether the way from `start` to `now` is the opening swipe: to the right, and more along than across. */
export function isOpeningSwipe(start: Point, now: Point, width: number): boolean {
  const dx = now.x - start.x;
  const dy = Math.abs(now.y - start.y);
  return startsAtEdge(start, width) && dx >= width * SWIPE_DISTANCE && dy < dx / 2;
}
