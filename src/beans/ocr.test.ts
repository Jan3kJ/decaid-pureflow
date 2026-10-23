import { describe, expect, it } from 'vitest';
import { bagText, cleanLine, statusText, type OcrLine } from './ocr';

const line = (text: string, height: number, confidence = 90): OcrLine => ({ text, height, confidence });

describe('bagText', () => {
  it('takes the roaster from the line with a roaster word and the name from the tallest other line', () => {
    const lines = [line('SQUARE MILE COFFEE ROASTERS\n', 22), line('RED BRICK\n', 60), line('Espresso blend · 350g\n', 19)];
    expect(bagText(lines)).toEqual({ roaster: 'Square Mile Coffee Roasters', name: 'Red Brick' });
  });

  it('takes the topmost line as the roaster when no line names one, and leaves out weights, dates and notes', () => {
    const lines = [
      line('Gardelli', 30),
      line('Ethiopia Gesha Village', 48),
      line('Tasting notes: jasmine, bergamot', 16),
      line('Roasted on 2026-10-08', 14),
      line('250 g', 20),
    ];
    expect(bagText(lines)).toEqual({ roaster: 'Gardelli', name: 'Ethiopia Gesha Village' });
  });

  it('cleans the marks Tesseract reads into a print and drops lines it is unsure of', () => {
    const lines = [
      line('~ | Kaffeerösterei Mahlgut ;', 24),
      line('»» Blütenhonig «', 52),
      line('Ww ~ ar //', 70, 30),
      line('ii', 40),
      line('Process: washed', 18),
    ];
    expect(bagText(lines)).toEqual({ roaster: 'Kaffeerösterei Mahlgut', name: 'Blütenhonig' });
  });

  it('gives only a name for a single line, and nothing for noise', () => {
    expect(bagText([line('Holy Goat', 40)])).toEqual({ roaster: '', name: 'Holy Goat' });
    expect(bagText([line('|| ~~ ..', 40), line('12/2026', 20), line('fe', 30, 20)])).toEqual({ roaster: '', name: '' });
    expect(bagText([])).toEqual({ roaster: '', name: '' });
  });

  it('keeps a name printed in mixed case as it is', () => {
    const lines = [line('The Barn', 26), line('Coffee Roasters Berlin', 18), line('Fazenda Pinhal', 44)];
    expect(bagText(lines)).toEqual({ roaster: 'Coffee Roasters Berlin', name: 'Fazenda Pinhal' });
  });
});

describe('cleanLine', () => {
  it('keeps letters, digits and the usual punctuation, with single spaces', () => {
    expect(cleanLine('  "Café  Señor" — 1/2 ')).toBe('Café Señor 1/2');
    expect(cleanLine("-- O'Brien & Sons, Ltd. --")).toBe("O'Brien & Sons, Ltd");
  });
});

describe('statusText', () => {
  it('words the reader statuses for the progress line', () => {
    expect(statusText('loading language traineddata')).toBe('Loading the English data');
    expect(statusText('recognizing text')).toBe('Reading the bag');
    expect(statusText('something new')).toBe('Reading the bag');
  });
});
