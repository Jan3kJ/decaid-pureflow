import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, hasSecondFill } from '../aflow';
import { buildCurve } from './curve';
import { toggleSecondFill } from './edit';
import { afterSecondFillToggle, graphUnits, keepSelection, phaseAt } from './selection';

const light = DEFAULT_PROFILES[1].params;
const withSecond = hasSecondFill(light) ? light : toggleSecondFill(light);
const without = toggleSecondFill(withSecond);

describe("the detail panel's phase", () => {
  it('moves from the 2nd fill to the infuse when the 2nd fill is gone, and stays otherwise', () => {
    expect(keepSelection('secondFill', without)).toBe('infuse');
    expect(keepSelection('secondFill', withSecond)).toBe('secondFill');
    expect(keepSelection('flow', without)).toBe('flow');
  });

  it('selects a new 2nd fill in detail mode only', () => {
    expect(afterSecondFillToggle('fill', withSecond, 'detail')).toBe('secondFill');
    expect(afterSecondFillToggle('fill', withSecond, 'simple')).toBe('fill');
    expect(afterSecondFillToggle('secondFill', without, 'detail')).toBe('infuse');
    expect(afterSecondFillToggle('pressurize', without, 'detail')).toBe('pressurize');
  });

  it('a tap selects the phase of what it took hold of, or the column it is in', () => {
    const curve = buildCurve(light, undefined, 'detail');
    const border = curve.borders[0];
    const level = curve.levels.find((l) => l.phase === 'flow')!;
    expect(phaseAt({ kind: 'border', border }, curve, 0)).toBe(border.phase);
    expect(phaseAt({ kind: 'level', level }, curve, 0)).toBe('flow');
    const fill = curve.phases[0];
    expect(phaseAt(null, curve, (fill.x0 + fill.x1) / 2)).toBe('fill');
    expect(phaseAt(null, curve, -5)).toBeUndefined();
  });

  it('turns pixels into graph units', () => {
    expect(graphUnits(40, 40, 800)).toBe(0);
    expect(graphUnits(440, 40, 800)).toBe(50);
  });
});
