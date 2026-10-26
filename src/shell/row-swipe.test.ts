import { describe, expect, it } from 'vitest';
import { mayMove, rowGesture, rowOffset, settlesAt, type RowSides } from './row-swipe';

const both: RowSides = { left: true, right: true };
const renameOnly: RowSides = { left: false, right: true };
const none: RowSides = { left: false, right: false };

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
  it('lets a closed row move only to a side it has', () => {
    expect(mayMove(0, -30, both)).toBe(true);
    expect(mayMove(0, 30, both)).toBe(true);
    expect(mayMove(0, -30, renameOnly)).toBe(false);
    expect(mayMove(0, 30, renameOnly)).toBe(true);
    expect(mayMove(0, 30, none)).toBe(false);
  });

  it('lets an open row move back', () => {
    expect(mayMove(1, -30, renameOnly)).toBe(true);
    expect(mayMove(-1, 30, both)).toBe(true);
  });
});

describe('rowOffset', () => {
  it('follows the finger between closed and open to the left', () => {
    expect(rowOffset(0, -40, 120, both)).toBe(-40);
    expect(rowOffset(0, -300, 120, both)).toBe(-120);
    expect(rowOffset(-1, 30, 120, both)).toBe(-90);
    expect(rowOffset(-1, -30, 120, both)).toBe(-120);
  });

  it('follows the finger between closed and open to the right', () => {
    expect(rowOffset(0, 40, 120, both)).toBe(40);
    expect(rowOffset(0, 300, 120, both)).toBe(120);
    expect(rowOffset(1, -30, 120, both)).toBe(90);
    expect(rowOffset(1, 30, 120, both)).toBe(120);
  });

  it('moves one button at most from where the row rests, and not to a side it lacks', () => {
    expect(rowOffset(-1, 300, 120, both)).toBe(0);
    expect(rowOffset(1, -300, 120, both)).toBe(0);
    expect(rowOffset(0, -50, 120, renameOnly)).toBe(0);
    expect(rowOffset(0, 50, 120, none)).toBe(0);
  });
});

describe('settlesAt', () => {
  it('opens after a third of the button either way', () => {
    expect(settlesAt(0, -39, 120, both)).toBe(0);
    expect(settlesAt(0, -41, 120, both)).toBe(-1);
    expect(settlesAt(0, 39, 120, both)).toBe(0);
    expect(settlesAt(0, 41, 120, both)).toBe(1);
  });

  it('closes after a third back, and stays open otherwise', () => {
    expect(settlesAt(-1, 41, 120, both)).toBe(0);
    expect(settlesAt(-1, 20, 120, both)).toBe(-1);
    expect(settlesAt(-1, -50, 120, both)).toBe(-1);
    expect(settlesAt(1, -41, 120, both)).toBe(0);
    expect(settlesAt(1, 300, 120, both)).toBe(1);
  });

  it('closes only, from open, however far the move back goes', () => {
    expect(settlesAt(-1, 400, 120, both)).toBe(0);
    expect(settlesAt(1, -400, 120, both)).toBe(0);
  });

  it('does not open to a side the row lacks', () => {
    expect(settlesAt(0, -80, 120, renameOnly)).toBe(0);
    expect(settlesAt(0, 80, 120, renameOnly)).toBe(1);
  });
});
