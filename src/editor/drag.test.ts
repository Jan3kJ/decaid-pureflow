import { describe, expect, it } from 'vitest';
import { DEFAULT_MACHINE_LIMITS, DEFAULT_PROFILES, resolveParams } from '../aflow';
import { borderTarget, buildCurve, dragTarget, weightTarget } from './curve';
import { dragged, lifted, startDrag, startWeightDrag } from './drag';

const params = DEFAULT_PROFILES[1].params;
const resolved = resolveParams(params);
const curve = buildCurve(params, DEFAULT_MACHINE_LIMITS, 'detail');
const perPixel = { seconds: () => 0.1, value: () => 0.02 };
const finger = { x: 300, y: 200, pointer: 7 };

describe('a drag on the graph', () => {
  it('on a line follows the finger up at the pace the line had', () => {
    const level = curve.levels.find((l) => l.line === 'pressure')!;
    const drag = startDrag({ kind: 'level', level }, finger, resolved, perPixel);
    expect(drag).toMatchObject({
      field: level.drags,
      shown: level.field,
      line: 'pressure',
      border: null,
      pointer: 7,
      startValue: resolved[level.drags],
      secondsPerPixel: 0,
      valuePerPixel: 0.02,
      gain: level.gain,
    });
    expect(dragged(drag, 300, 150)).toBeCloseTo(dragTarget(drag, drag.startValue, 50 * 0.02));
    expect(dragged(drag, 900, 200)).toBe(drag.startValue);
  });

  it('on a border starts where the border is drawn and follows the finger right', () => {
    const border = curve.borders.find((b) => b.phase !== 'infuse')!;
    const drag = startDrag({ kind: 'border', border }, finger, resolved, perPixel);
    expect(drag).toMatchObject({
      field: border.field,
      line: null,
      border,
      startValue: border.start,
      secondsPerPixel: 0.1,
      valuePerPixel: 0,
      gain: 1,
    });
    expect(dragged(drag, 340, 0)).toBeCloseTo(borderTarget(border, drag.time, border.start + 4));
  });

  it('on the infuse-to chip moves the weight from where the chip was pressed', () => {
    const border = curve.borders.find((b) => b.phase === 'infuse')!;
    const drag = startWeightDrag(border, finger, 20, resolved.infuseWeight, 0.1);
    expect(drag).toMatchObject({
      field: 'infuseWeight',
      shown: 'infuseWeight',
      line: null,
      border,
      startX: 280,
      x: 300,
      startValue: resolved.infuseWeight,
    });
    expect(dragged(drag, 300, 0)).toBeCloseTo(weightTarget(resolved.infuseWeight, 2));
  });
});

describe('a finger that lifts or is cancelled', () => {
  it('ends its drag where it last set the value; another pointer leaves the drag on', () => {
    const level = curve.levels.find((l) => l.line === 'temperature')!;
    const drag = startDrag({ kind: 'level', level }, finger, resolved, perPixel);
    const last = dragged(drag, 300, 260);
    // A pointercancel is handled as the lift: nothing more is set, the value stays at `last`.
    expect(lifted(drag, finger.pointer)).toBeNull();
    expect(last).not.toBe(drag.startValue);
    expect(lifted(drag, 8)).toBe(drag);
    expect(lifted(null, finger.pointer)).toBeNull();
  });
});
