// A drag on the editor's graph: what a finger took hold of, and the value under it as it
// moves. Pure: the drag and the finger in, the value out (the caller snaps it).
import type { ResolvedParams } from '../aflow';
import { borderTarget, dragTarget, weightTarget, type Border, type EditField, type Hit, type LineId } from './curve';

export interface Drag {
  /** the value the drag changes */
  field: EditField;
  /** the value under the finger, which the pop-up shows */
  shown: EditField;
  /** a level line, or null for a border and the infuse weight */
  line: LineId | null;
  /** the border that is dragged, or that moves with the infuse weight */
  border: Border | null;
  /** the duration as it was when the drag of a border began (curve.ts, borderTarget) */
  time: number;
  pointer: number;
  startX: number;
  startY: number;
  startValue: number;
  /** seconds per pixel to the right, as it was when the drag of a border or the weight began */
  secondsPerPixel: number;
  /**
   * a line's value per pixel up, as it was when the drag began: the temperature axis widens
   * under a drag, and the value keeps following the finger at the same pace
   */
  valuePerPixel: number;
  /** how far the value moves per unit the line under the finger moves (curve.ts, Level) */
  gain: number;
  x: number;
  y: number;
}

/** Where a finger is, in the graph's pixels, and which pointer it is. */
export interface Finger {
  x: number;
  y: number;
  pointer: number;
}

/** A border's seconds per pixel and a line's value per pixel, as the plot is drawn now. */
export interface PerPixel {
  seconds: (border: Border) => number;
  value: (line: LineId) => number;
}

/** The drag a finger starts on a line or a border. */
export function startDrag(hit: Hit, finger: Finger, resolved: ResolvedParams, perPixel: PerPixel): Drag {
  const field = hit.kind === 'level' ? hit.level.drags : hit.border.field;
  return {
    field,
    shown: hit.kind === 'level' ? hit.level.field : hit.border.field,
    line: hit.kind === 'level' ? hit.level.line : null,
    border: hit.kind === 'border' ? hit.border : null,
    time: resolved[field],
    pointer: finger.pointer,
    startX: finger.x,
    startY: finger.y,
    // The end flow may follow the toggle: its drag starts from the value the toggle gives.
    // A border starts where it is drawn: the infuse may be drawn by its weight.
    startValue: hit.kind === 'border' ? hit.border.start : resolved[field],
    secondsPerPixel: hit.kind === 'border' ? perPixel.seconds(hit.border) : 0,
    valuePerPixel: hit.kind === 'level' ? perPixel.value(hit.level.line) : 0,
    gain: hit.kind === 'level' ? hit.level.gain : 1,
    x: finger.x,
    y: finger.y,
  };
}

/**
 * The drag of the infuse-to chip, pressed `dx` pixels left of where the finger is now: the
 * weight moves with the finger as the infuse's border would, through the weight's estimate.
 */
export function startWeightDrag(border: Border, finger: Finger, dx: number, weight: number, secondsPerPixel: number): Drag {
  return {
    field: 'infuseWeight',
    shown: 'infuseWeight',
    line: null,
    border,
    time: weight,
    pointer: finger.pointer,
    startX: finger.x - dx,
    startY: finger.y,
    startValue: weight,
    secondsPerPixel,
    valuePerPixel: 0,
    gain: 1,
    x: finger.x,
    y: finger.y,
  };
}

/** The value under the finger at (x, y), before it is snapped. */
export function dragged(drag: Drag, x: number, y: number): number {
  const seconds = (x - drag.startX) * drag.secondsPerPixel;
  if (drag.line) return dragTarget(drag, drag.startValue, (drag.startY - y) * drag.valuePerPixel);
  if (drag.field === 'infuseWeight') return weightTarget(drag.startValue, seconds);
  return borderTarget(drag.border!, drag.time, drag.startValue + seconds);
}
