// A picker row's swipe (spec 3.10): a drag to the left opens the row's delete button, a drag
// back closes it, a vertical drag is the list's scroll. Pure: distances in, decisions out.
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

/** Where the row is drawn while dragged by `dx`: from its place, held between closed and open by `width`. */
export function rowOffset(open: boolean, dx: number, width: number): number {
  return Math.min(0, Math.max(-width, (open ? -width : 0) + dx));
}

/** Whether the row is open after a drag of `dx`: it opens or closes after a third of the button's `width`. */
export function settlesOpen(open: boolean, dx: number, width: number): boolean {
  return open ? dx < width / 3 : dx < -width / 3;
}
