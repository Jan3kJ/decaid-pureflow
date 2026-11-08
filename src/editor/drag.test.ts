import { describe, expect, it } from 'vitest';
import { DEFAULT_MACHINE_LIMITS, DEFAULT_PROFILES, resolveParams } from '../aflow';
import { borderTarget, buildCurve, dragPixels, dragTarget, weightTarget } from './curve';
import { dragged, lifted, startDrag, startWeightDrag } from './drag';

const params = DEFAULT_PROFILES[1].params;
const resolved = resolveParams(params);
const curve = buildCurve(params, DEFAULT_MACHINE_LIMITS, 'detail');
const perPixel = { seconds: () => 0.1, value: () => 0.02, height: () => 200 };
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
      plotHeight: 200,
      gain: level.gain,
    });
    expect(dragged(drag, 300, 150)).toBeCloseTo(dragTarget(drag, drag.startValue, dragPixels(50, 200) * 0.02));
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
      plotHeight: 0,
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

describe('the dynamic pace of a line drag', () => {
  const height = 300;
  it('counts at most a quarter of the linear amount over the first 5 % of the height', () => {
    for (let d = 1; d <= 15; d++) expect(dragPixels(d, height)).toBeLessThanOrEqual(0.25 * d + 1e-9);
  });
  it('is continuous and rises', () => {
    let last = 0;
    for (let d = 0.5; d <= 600; d += 0.5) {
      const now = dragPixels(d, height);
      expect(now).toBeGreaterThan(last);
      expect(now - last).toBeLessThan(2 * 0.5 + 1e-9);
      last = now;
    }
  });
  it('keeps the fine pace to 5 % and the present pace from 20 % of the height', () => {
    const slope = (t: number) => (dragPixels((t + 1e-4) * height, height) - dragPixels(t * height, height)) / (1e-4 * height);
    expect(slope(0.04)).toBeCloseTo(0.25, 3);
    expect(slope(0.049)).toBeCloseTo(0.25, 1);
    expect(slope(0.21)).toBeCloseTo(2, 3);
    expect(slope(0.5)).toBeCloseTo(2, 3);
  });
  it('is symmetric and gives the start at the start', () => {
    expect(dragPixels(0, height)).toBe(0);
    for (const d of [3, 40, 120, 250]) expect(dragPixels(-d, height)).toBe(-dragPixels(d, height));
  });
  it('is at least the linear amount past 20 % of the height, so a full drag reaches the end', () => {
    for (let d = 0.25 * height; d <= 2 * height; d += 5) expect(dragPixels(d, height)).toBeGreaterThanOrEqual(d);
  });
});
