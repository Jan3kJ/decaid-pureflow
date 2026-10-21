import { describe, expect, it } from 'vitest';
import { rowGesture, rowOffset, settlesOpen } from './row-swipe';

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

describe('rowOffset', () => {
  it('follows the finger between closed and open', () => {
    expect(rowOffset(false, -40, 120)).toBe(-40);
    expect(rowOffset(false, -300, 120)).toBe(-120);
    expect(rowOffset(false, 50, 120)).toBe(0);
    expect(rowOffset(true, 30, 120)).toBe(-90);
    expect(rowOffset(true, -30, 120)).toBe(-120);
  });
});

describe('settlesOpen', () => {
  it('opens after a third of the button to the left', () => {
    expect(settlesOpen(false, -39, 120)).toBe(false);
    expect(settlesOpen(false, -41, 120)).toBe(true);
  });

  it('closes after a third back to the right, and stays open otherwise', () => {
    expect(settlesOpen(true, 41, 120)).toBe(false);
    expect(settlesOpen(true, 20, 120)).toBe(true);
    expect(settlesOpen(true, -50, 120)).toBe(true);
  });
});
