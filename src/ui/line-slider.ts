// The pure parts of the line slider (LineSlider.svelte): where a value stands on its line, what a
// sideways drag makes of it, and what a tap does.
import { dragPixels } from '../editor/curve';

/** A finger moves this far (CSS px) before a touch is a drag and no longer a tap. */
export const TAP_SLOP = 6;

/** A value held inside its range and step; the step's decimals only, so 0.1 steps add no float dust. */
export function steppedValue(value: number, min: number, max: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const stepped = +(Math.round(value / step) * step).toFixed(decimals);
  return Math.min(max, Math.max(min, stepped));
}

/** 0 to 1, where a value stands between the line's ends */
export function fractionOf(value: number, min: number, max: number): number {
  return max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
}

/**
 * The value after a drag of `distance` px sideways on a line `width` px wide, from the value the
 * drag began at: relative, so a touch that does not move changes nothing. The finger's travel is
 * the editor's slow-then-fast pace (dragPixels) with the line's width as the reference length,
 * and a full range is a bit under half a width at the fast pace.
 */
export function draggedValue(start: number, distance: number, width: number, min: number, max: number, step: number): number {
  if (width <= 0) return steppedValue(start, min, max, step);
  return steppedValue(start + (dragPixels(distance, width) / width) * (max - min), min, max, step);
}

/**
 * The value an arrow, page or home/end key makes, or null for any other key. An arrow is one
 * step, page up and down ten.
 */
export function keyedValue(key: string, value: number, min: number, max: number, step: number): number | null {
  const moves: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
  if (key === 'Home') return min;
  if (key === 'End') return max;
  const move = moves[key];
  return move === undefined ? null : steppedValue(value + move * step, min, max, step);
}

/** What a touch that did not move does: light an unlit line; open the pad on the number of a lit one. */
export function tapOutcome(lit: boolean, onNumber: boolean): 'light' | 'pad' {
  return lit && onNumber ? 'pad' : 'light';
}

/** px from the line's left edge to a label `labelWidth` wide centred on `fraction`, held inside the line's ends */
export function labelLeft(fraction: number, lineWidth: number, labelWidth: number): number {
  return Math.max(0, Math.min(lineWidth - labelWidth, fraction * lineWidth - labelWidth / 2));
}
