import { describe, expect, it } from 'vitest';
import { centredScroll } from './centre';

describe('centredScroll', () => {
  // A row 1000 px wide whose cards take 3000 px.
  it('puts a card in the middle on the row centre', () => {
    expect(centredScroll(1400, 600, 1000, 3000)).toBe(1200);
  });

  it('cannot scroll before the first card', () => {
    expect(centredScroll(0, 600, 1000, 3000)).toBe(0);
    expect(centredScroll(150, 200, 1000, 3000)).toBe(0);
  });

  it('cannot scroll past the last card', () => {
    expect(centredScroll(2400, 600, 1000, 3000)).toBe(2000);
  });

  it('does not scroll a row whose cards fit', () => {
    expect(centredScroll(300, 200, 1000, 800)).toBe(0);
  });
});
