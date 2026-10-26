// A picker row's swipe (spec 3.10, 3.17 item 5): a drag to the left opens the row's delete
// button at its right end, a drag to the right its rename button at its left end, a drag back
// closes it; a vertical drag is the list's scroll. Pure: distances in, decisions out.
import { SWIPE_SLOP } from './swipe';

/** What a drag on a row is: the row's, the list's scroll, or not decided yet. */
export type RowGesture = 'row' | 'scroll' | null;

/** Where a row rests: -1 moved left (delete shows), 1 moved right (rename shows), 0 closed. */
export type RowRest = -1 | 0 | 1;

/** The ways a row may open: `left` to its delete button, `right` to its rename button. */
export interface RowSides {
  left: boolean;
  right: boolean;
}

/** A drag is decided once it moved `SWIPE_SLOP` pixels; it is the row's when it went more along than across. */
export function rowGesture(dx: number, dy: number): RowGesture {
  const along = Math.abs(dx);
  const across = Math.abs(dy);
  if (Math.max(along, across) < SWIPE_SLOP) return null;
  return across < along / 2 ? 'row' : 'scroll';
}

/** Whether a row resting at `rest` may open the other way at all: a closed row only to a side it has. */
export function mayMove(rest: RowRest, dx: number, sides: RowSides): boolean {
  if (rest !== 0) return true;
  return dx < 0 ? sides.left : sides.right;
}

/**
 * Where the row is drawn while dragged by `dx`, in px from its place (negative: moved left):
 * one button's `width` at most from where it rests, and never to a side it does not have.
 */
export function rowOffset(rest: RowRest, dx: number, width: number, sides: RowSides): number {
  const low = Math.min(rest, Math.max(rest - 1, sides.left ? -1 : 0));
  const high = Math.max(rest, Math.min(rest + 1, sides.right ? 1 : 0));
  return Math.min(high * width, Math.max(low * width, rest * width + dx)) || 0;
}

/** Where the row rests after a drag of `dx`: one step that way after a third of the button's `width`, else where it was. */
export function settlesAt(rest: RowRest, dx: number, width: number, sides: RowSides): RowRest {
  if (Math.abs(dx) < width / 3) return rest;
  const to = rest + Math.sign(dx);
  if (to < -1 || to > 1 || (to === -1 && !sides.left) || (to === 1 && !sides.right)) return rest;
  return to as RowRest;
}
