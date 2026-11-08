import { describe, expect, it } from 'vitest';
import { draggedValue, fractionOf, keyedValue, labelLeft, steppedValue, tapOutcome } from './line-slider';

describe('the line slider', () => {
  it('holds a value to its step and its range, without float dust', () => {
    expect(steppedValue(6.449, 0.1, 8, 0.1)).toBe(6.4);
    expect(steppedValue(0.3 + 0.6, 0.1, 8, 0.1)).toBe(0.9);
    expect(steppedValue(74.6, 50, 95, 1)).toBe(75);
    expect(steppedValue(200, 50, 95, 1)).toBe(95);
    expect(steppedValue(-3, 50, 95, 1)).toBe(50);
  });

  it('places a value between the line ends', () => {
    expect(fractionOf(5, 5, 120)).toBe(0);
    expect(fractionOf(120, 5, 120)).toBe(1);
    expect(fractionOf(62.5, 5, 120)).toBeCloseTo(0.5);
    expect(fractionOf(500, 5, 120)).toBe(1);
  });

  it('drags from where the value was: no travel, no change', () => {
    expect(draggedValue(30, 0, 800, 5, 120, 1)).toBe(30);
    expect(draggedValue(30, 2, 800, 5, 120, 1)).toBe(30);
  });

  it('starts slow and grows with the travel, both ways alike', () => {
    const near = draggedValue(30, 40, 800, 5, 120, 1) - 30;
    const far = draggedValue(30, 80, 800, 5, 120, 1) - 30;
    // a linear pace over 40 px of 800 is 5.75; the fine start makes less of it
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(5.75 / 3);
    expect(far).toBeGreaterThan(2 * near);
    expect(draggedValue(60, -40, 800, 5, 120, 1) - 60).toBe(-(draggedValue(60, 40, 800, 5, 120, 1) - 60));
  });

  it('reaches the range ends and goes no further', () => {
    expect(draggedValue(30, 800, 800, 5, 120, 1)).toBe(120);
    expect(draggedValue(30, -800, 800, 5, 120, 1)).toBe(5);
    expect(draggedValue(8, 5000, 800, 0.1, 8, 0.1)).toBe(8);
  });

  it('steps a dragged flow by 0.1', () => {
    const value = draggedValue(4, 100, 800, 0.1, 8, 0.1);
    expect(Math.round(value * 10)).toBeCloseTo(value * 10, 9);
  });

  it('leaves a line of no width where it was', () => {
    expect(draggedValue(30, 50, 0, 5, 120, 1)).toBe(30);
  });

  it('steps by the arrow keys, ten steps by the page keys, ends by home and end', () => {
    expect(keyedValue('ArrowLeft', 8, 0.1, 8, 0.1)).toBe(7.9);
    expect(keyedValue('ArrowRight', 8, 0.1, 8, 0.1)).toBe(8);
    expect(keyedValue('ArrowUp', 30, 5, 120, 1)).toBe(31);
    expect(keyedValue('PageDown', 30, 5, 120, 1)).toBe(20);
    expect(keyedValue('Home', 30, 5, 120, 1)).toBe(5);
    expect(keyedValue('End', 30, 5, 120, 1)).toBe(120);
    expect(keyedValue('a', 30, 5, 120, 1)).toBeNull();
  });

  it('lights on a tap and opens the pad on a second tap on the number of the lit line', () => {
    expect(tapOutcome(false, true)).toBe('light');
    expect(tapOutcome(false, false)).toBe('light');
    expect(tapOutcome(true, false)).toBe('light');
    expect(tapOutcome(true, true)).toBe('pad');
  });

  it("holds the number inside the line's ends", () => {
    expect(labelLeft(0, 800, 100)).toBe(0);
    expect(labelLeft(1, 800, 100)).toBe(700);
    expect(labelLeft(0.5, 800, 100)).toBe(350);
  });
});
