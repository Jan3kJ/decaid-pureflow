import { describe, expect, it } from 'vitest';
import { mayMove, rowGesture, rowOffset, settlesOpen } from './row-swipe';

describe('rowGesture', () => {
  it('waits for the slop', () => {
    expect(rowGesture(-4, 3)).toBeNull();
  });

  it("is the row's when the drag goes along, the list's when it goes across", () => {
    expect(rowGesture(-30, 5)).toBe('row');
    expect(rowGesture(25, -4)).toBe('row');
    expect(rowGesture(-12, 20)).toBe('scroll');
    expect(rowGesture(-20, 10)).toBe('scroll');
  });
});

describe('mayMove', () => {
  it('lets a closed row move only to the left, and only when it has a button', () => {
    expect(mayMove(false, -30, true)).toBe(true);
    expect(mayMove(false, 30, true)).toBe(false);
    expect(mayMove(false, -30, false)).toBe(false);
  });

  it('lets an open row move either way', () => {
    expect(mayMove(true, 30, true)).toBe(true);
    expect(mayMove(true, -30, true)).toBe(true);
  });
});

describe('rowOffset', () => {
  it('follows the finger between closed and open', () => {
    expect(rowOffset(false, -40, 240)).toBe(-40);
    expect(rowOffset(false, -300, 240)).toBe(-240);
    expect(rowOffset(true, 30, 240)).toBe(-210);
    expect(rowOffset(true, -30, 240)).toBe(-240);
  });

  it('never moves the row to the right of its place', () => {
    expect(rowOffset(false, 50, 240)).toBe(0);
    expect(rowOffset(true, 400, 240)).toBe(0);
  });
});

describe('settlesOpen', () => {
  it('opens after a third of the buttons to the left', () => {
    expect(settlesOpen(false, -79, 240)).toBe(false);
    expect(settlesOpen(false, -81, 240)).toBe(true);
    expect(settlesOpen(false, 300, 240)).toBe(false);
  });

  it('closes after a third back to the right, and stays open otherwise', () => {
    expect(settlesOpen(true, 81, 240)).toBe(false);
    expect(settlesOpen(true, 400, 240)).toBe(false);
    expect(settlesOpen(true, 40, 240)).toBe(true);
    expect(settlesOpen(true, -50, 240)).toBe(true);
  });
});
