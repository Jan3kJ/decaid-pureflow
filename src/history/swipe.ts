// The gestures that open the shot history and the steam page (spec 3.1, 3.7): a swipe from
// the left edge to the right opens the history, its mirror from the right edge to the left
// the steam page. Pure: positions in, yes or no out.

export interface Point {
  x: number;
  y: number;
}

/** The edge a swipe starts at: the history's on the left, the steam page's on the right. */
export type Edge = 'left' | 'right';

/** A swipe starts in this share of the width from its edge: home has no button there but the tab. */
export const SWIPE_EDGE = 0.2;
/** It opens the history after this share of the width. */
export const SWIPE_DISTANCE = 0.06;

/** Whether a touch that went down at `start` may become the opening swipe from `edge`. */
export function startsAtEdge(start: Point, width: number, edge: Edge = 'left'): boolean {
  return (edge === 'left' ? start.x : width - start.x) <= width * SWIPE_EDGE;
}

/**
 * Whether the way from `start` to `now` is the opening swipe from `edge`: away from the
 * edge, and more along than across.
 */
export function isOpeningSwipe(start: Point, now: Point, width: number, edge: Edge = 'left'): boolean {
  const dx = edge === 'left' ? now.x - start.x : start.x - now.x;
  const dy = Math.abs(now.y - start.y);
  return startsAtEdge(start, width, edge) && dx >= width * SWIPE_DISTANCE && dy < dx / 2;
}
