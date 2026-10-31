// A picker row's swipe: a drag to the left opens the row, its buttons (rename beside delete) under
// its right end; a drag to the right closes an open row, and on a closed row it is the page's swipe
// back, not the row's; a vertical drag is the list's scroll. Pure: distances in, decisions out.
import { SWIPE_SLOP } from './swipe';

/** What a drag on a row is: the row's, the list's scroll, or not decided yet. */
export type RowGesture = 'row' | 'scroll' | null;

/** A drag is decided once it moved `SWIPE_SLOP` pixels; it is the row's when it went more along than across. */
export function rowGesture(dx: number, dy: number): RowGesture {
  const along = Math.abs(dx);
  const across = Math.abs(dy);
  if (Math.max(along, across) < SWIPE_SLOP) return null;
  return across < along / 2 ? 'row' : 'scroll';
}

/** Whether a drag of `dx` moves the row: an open row either way, a closed one only to the left and only when it has a button. */
export function mayMove(open: boolean, dx: number, opens: boolean): boolean {
  return open || (dx < 0 && opens);
}

/**
 * Where the row is drawn while dragged by `dx`, in px from its place (negative: moved left):
 * between closed and open by `width`, the width of its buttons.
 */
export function rowOffset(open: boolean, dx: number, width: number): number {
  return Math.min(0, Math.max(-width, (open ? -width : 0) + dx)) || 0;
}

/** Whether the row rests open after a drag of `dx`: it opens or closes after a third of its buttons' `width`, else stays. */
export function settlesOpen(open: boolean, dx: number, width: number): boolean {
  if (Math.abs(dx) < width / 3) return open;
  return dx < 0;
}
