import { describe, expect, it } from 'vitest';
import bags from './ocr-bags.json';
import { bagText, cleanLine, statusText, type KnownBean, type OcrLine } from './ocr';

let top = 0;
/** A line under the one made before it, 200 px wide. */
const line = (text: string, height: number, confidence = 90): OcrLine => {
  const box = { x0: 100, y0: top, x1: 300, y1: top + height };
  top += height + 10;
  return { text, height, confidence, box };
};

/** The roasters of the founder's catalogue, with a few beans and countries. */
const CATALOGUE: KnownBean[] = [
  { roaster: 'aniko', name: 'Tropic Candy', country: 'Kolumbien' },
  { roaster: 'aniko', name: 'Honey Dream', country: 'Brasilien' },
  { roaster: 'aniko', name: 'Feel the Sun', country: null },
  { roaster: 'aniko', name: 'Ethiopia Guji', country: 'Äthiopien' },
  { roaster: 'hopplo', name: 'Espresso', country: null },
  { roaster: 'dak', name: 'Milky Cake', country: 'Brasilien' },
  { roaster: 'seekind', name: 'Kaffeehaus', country: null },
  { roaster: 'kaffeekommune', name: 'Hausmischung', country: 'Indonesien' },
  { roaster: 'maldaner', name: 'Omni', country: null },
  { roaster: 'kaffeesack', name: 'Brasil Santos', country: 'Brasilien' },
];

/** The lines `scripts/ocr-probe.mjs` read from a photo in docs/product/bags/ with the given options. */
function bag(photo: string, recipe = ''): OcrLine[] {
  const read = bags.find((entry) => entry.photo === photo && entry.recipe === recipe);
  if (!read) throw new Error(`no recorded reading of ${photo} ${recipe}`);
  return read.lines;
}

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

describe("bagText on the founder's bag photos", () => {
  it('reads maldaner / Elisabeth: the descriptor under the roaster, the tasting line and the country are no name', () => {
    const lines = bag('maldaner-elisabeth.jpg', '--scale 0.6 --prepare');
    expect(bagText(lines, CATALOGUE)).toEqual({ roaster: 'maldaner', name: 'Elisabeth' });
    // without the catalogue the roaster is the line with no roaster's word on top
    expect(bagText(lines).name).toBe('Elisabeth');
  });

  it('reads maldaner / Abdul: OMNI ROAST under the roaster is its descriptor', () => {
    const lines = bag('maldaner-abdul.jpg', '--scale 0.6 --prepare');
    expect(bagText(lines, CATALOGUE)).toEqual({ roaster: 'maldaner', name: 'Abdul' });
  });

  it('reads aniko / Feel The Sun: the logo at the bottom is the roaster, the tasting line is dropped', () => {
    const lines = bag('aniko-feel-the-sun.jpg', '--scale 1.3');
    expect(bagText(lines, [])).toEqual({ roaster: 'aniko', name: 'Feel The Sun' });
    // a known bean of the roaster is offered as it is spelt in the catalogue
    expect(bagText(lines, CATALOGUE)).toEqual({ roaster: 'aniko', name: 'Feel the Sun' });
  });

  it('finds no roaster of the catalogue on the turned bag read upright, and aniko when it is turned', () => {
    const roasters = new Set(CATALOGUE.map((bean) => bean.roaster));
    for (const recipe of ['', '--scale 1.2 --prepare']) {
      const upright = bagText(bag('aniko-honey-dream-rotated.jpg', recipe), CATALOGUE);
      expect(roasters.has(upright.roaster)).toBe(false);
      expect(upright.name).toBe('');
    }
    const turned = bagText(bag('aniko-honey-dream-rotated.jpg', '--rotate 270 --scale 1.2 --prepare'), CATALOGUE);
    expect(turned.roaster).toBe('aniko');
    // 'Dream' is lost under the blue cloud of the print; the tasting words one to a line are smaller
    expect(turned.name).toBe('Honey');
  });

  it('keeps the descriptors and the tasting lines out of both fields', () => {
    const fields = bags.flatMap((entry) => {
      const { name, roaster } = bagText(entry.lines, CATALOGUE);
      return [name, roaster];
    });
    for (const field of fields) expect(field).not.toMatch(/kaffeehaus|omni|roast|haselnuss|vanilla|natural|brasilien|indonesien/i);
  });
});

describe('bagText rules', () => {
  it('takes a roaster of the catalogue within the edit distance, whatever its words', () => {
    expect(bagText([line('rnaldaner', 30), line('Elisabeth', 60)], CATALOGUE)).toEqual({ roaster: 'maldaner', name: 'Elisabeth' });
    expect(bagText([line('Seekinb', 30), line('Lucia', 60)], CATALOGUE).roaster).toBe('seekind');
    expect(bagText([line('kaffeekomrnune', 30), line('Hausmischung', 60)], CATALOGUE)).toEqual({
      roaster: 'kaffeekommune',
      name: 'Hausmischung',
    });
    // a short name must be read exactly: 'dal' is not 'dak'
    expect(bagText([line('dal', 30), line('Milky Cake', 60)], CATALOGUE).roaster).not.toBe('dak');
    // one letter off is too many for a name of four letters or fewer, two for one of five to seven
    expect(bagText([line('anlkq', 30), line('Tropic Candy', 60)], CATALOGUE).roaster).not.toBe('aniko');
  });

  it('drops a line of a roaster word alone and takes the line above it as the roaster', () => {
    const lines = [line('TROPIC CANDY', 70), line('2 ame', 90), line('aniko', 40), line('COFFeg ROASTERS', 14)];
    expect(bagText(lines)).toEqual({ roaster: 'aniko', name: 'Tropic Candy' });
    expect(bagText(lines, CATALOGUE)).toEqual({ roaster: 'aniko', name: 'Tropic Candy' });
  });

  it('gives no name for a line of short words or one read unsurely', () => {
    expect(bagText([line('aniko', 40), line('2 ame', 90)], CATALOGUE)).toEqual({ roaster: 'aniko', name: '' });
    expect(bagText([line('aniko', 40), line('Lucky Strike', 90, 55)], CATALOGUE)).toEqual({ roaster: 'aniko', name: '' });
  });

  it('drops tasting lines, countries of the catalogue and the small print', () => {
    const lines = [
      line('dak', 30),
      line('Haselnuss. Kakao. Nougat.', 60),
      line('chocolate · vanilla · blueberry', 60),
      line('Brasilien', 60),
      line('Milky Cake', 50),
      line('Tiny Print Here', 15),
    ];
    expect(bagText(lines, CATALOGUE)).toEqual({ roaster: 'dak', name: 'Milky Cake' });
  });

  it('offers a known bean of the roaster when a line reads as it', () => {
    const lines = [line('ANIKO', 40), line('TROPIC CANDV', 30), line('Something Large', 80)];
    expect(bagText(lines, CATALOGUE)).toEqual({ roaster: 'aniko', name: 'Tropic Candy' });
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
