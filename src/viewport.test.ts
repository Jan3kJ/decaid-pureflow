import { describe, expect, it } from 'vitest';
import { LIFT_MARGIN, keptSize, liftFor } from './viewport';

const FULL = { width: 1280, height: 800 };
const KEYBOARD = { width: 1280, height: 450 };

describe('keptSize (spec 3.9, item 10)', () => {
  it('takes the first size and every size while nobody types', () => {
    expect(keptSize(null, FULL, false)).toEqual(FULL);
    expect(keptSize(null, KEYBOARD, true)).toEqual(KEYBOARD);
    expect(keptSize(FULL, KEYBOARD, false)).toEqual(KEYBOARD);
  });

  it('keeps the size when the height shrinks while a field has the focus: that is the keyboard', () => {
    expect(keptSize(FULL, KEYBOARD, true)).toEqual(FULL);
  });

  it('takes a height that grows and a new width, typing or not', () => {
    expect(keptSize(KEYBOARD, FULL, true)).toEqual(FULL);
    expect(keptSize(FULL, { width: 800, height: 450 }, true)).toEqual({ width: 800, height: 450 });
  });
});

describe('liftFor', () => {
  it('is 0 for an element that ends above the keyboard', () => {
    expect(liftFor(80, 300, 450)).toBe(0);
    expect(liftFor(80, 450 - LIFT_MARGIN, 450)).toBe(0);
  });

  it('lifts an element that reaches under the keyboard to just above it', () => {
    expect(liftFor(400, 600, 450)).toBe(600 + LIFT_MARGIN - 450);
  });

  it('never lifts an element past the top of the screen', () => {
    expect(liftFor(100, 700, 450)).toBe(100);
  });
});
