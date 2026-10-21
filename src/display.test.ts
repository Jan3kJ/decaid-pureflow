import { describe, expect, it } from 'vitest';
import { DISPLAY_SIZES, LINE_WIDTHS, applyDisplay } from './display';

describe('Skin > Display', () => {
  it("offers Streamline's sizes and line widths, medium and normal at 1", () => {
    expect(DISPLAY_SIZES.map((choice) => [choice.label, choice.value])).toEqual([
      ['Small', 0.85],
      ['Medium', 1],
      ['Large', 1.15],
      ['Extra Large', 1.3],
    ]);
    expect(LINE_WIDTHS.map((choice) => [choice.label, choice.value])).toEqual([
      ['Thin', 0.6],
      ['Normal', 1],
      ['Thick', 1.5],
      ['Extra Thick', 2],
    ]);
  });

  it('puts both factors on the root', () => {
    const set: Record<string, string> = {};
    const root = { style: { setProperty: (name: string, value: string) => (set[name] = value) } } as unknown as HTMLElement;
    applyDisplay({ displaySize: 1.15, lineWidth: 0.6 }, root);
    expect(set).toEqual({ '--display-size': '1.15', '--line-width': '0.6' });
  });
});
