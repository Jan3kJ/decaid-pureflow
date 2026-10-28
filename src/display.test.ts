import { describe, expect, it } from 'vitest';
import { DISPLAY_SIZES, LINE_WIDTHS, applyDisplay, gramsOf } from './display';

describe('Skin > Display', () => {
  it("offers Streamline's sizes and line widths, medium and normal at 1", () => {
    expect(DISPLAY_SIZES.map((choice) => [choice.label, choice.value])).toEqual([
      ['small', 0.85],
      ['medium', 1],
      ['large', 1.15],
      ['extra large', 1.3],
    ]);
    expect(LINE_WIDTHS.map((choice) => [choice.label, choice.value])).toEqual([
      ['thin', 0.6],
      ['normal', 1],
      ['thick', 1.5],
      ['extra thick', 2],
    ]);
  });

  it('puts both factors on the root', () => {
    const set: Record<string, string> = {};
    const root = { style: { setProperty: (name: string, value: string) => (set[name] = value) } } as unknown as HTMLElement;
    applyDisplay({ displaySize: 1.15, lineWidth: 0.6 }, root);
    expect(set).toEqual({ '--display-size': '1.15', '--line-width': '0.6' });
  });
});

describe('gramsOf', () => {
  it('shows a reading from -0.1 to 0.1 g, both ends included, as 0.0 g, never -0.0', () => {
    for (const weight of [-0.1, -0.05, -0, 0, 0.1]) expect(gramsOf(weight)).toBe('0.0 g');
  });

  it('applies the band before rounding, and keeps a negative weight outside it', () => {
    expect(gramsOf(0.11)).toBe('0.1 g');
    expect(gramsOf(-0.11)).toBe('-0.1 g');
    expect(gramsOf(0.15)).toBe('0.1 g');
    expect(gramsOf(-0.2)).toBe('-0.2 g');
    expect(gramsOf(-0.6)).toBe('-0.6 g');
    expect(gramsOf(36.04)).toBe('36.0 g');
  });

  it('shows no reading as a dash, and takes the unit the caller writes', () => {
    expect(gramsOf(null)).toBe('–');
    expect(gramsOf(undefined)).toBe('–');
    expect(gramsOf(36.04, '')).toBe('36.0');
    expect(gramsOf(36.04, 'g')).toBe('36.0g');
  });
});
