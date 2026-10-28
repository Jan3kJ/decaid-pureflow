import { describe, expect, it } from 'vitest';
import { DISPLAY_SIZES, LINE_WIDTHS, applyDisplay } from './display';

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
