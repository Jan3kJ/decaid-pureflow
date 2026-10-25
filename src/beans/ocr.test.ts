import { describe, expect, it } from 'vitest';
import bags from './ocr-bags.json';
import {
  bagText,
  chipLines,
  cleanLine,
  lineHeight,
  longSide,
  passScore,
  passWords,
  readPasses,
  statusText,
  type KnownBean,
  type OcrLine,
  type Pass,
  type PassPlan,
} from './ocr';
import { preparePixels } from './prepare';

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

/** The passes `scripts/ocr-probe.mjs` read from a photo in docs/product/bags/, in the order read. */
function recorded(photo: string): Pass[] {
  const read = bags.find((entry) => entry.photo === photo);
  if (!read) throw new Error(`no recorded reading of ${photo}`);
  return read.passes as Pass[];
}

const plan = ({ degrees, long, invert }: PassPlan) => `${degrees} ${long}${invert ? ' inverted' : ''}`;

/** The skin's reading of a photo, replayed: every pass it asks for is served from the recorded ones. */
async function replay(photo: string, catalogue = CATALOGUE) {
  const passes = recorded(photo);
  const asked: string[] = [];
  const read = await readPasses(async (wanted) => {
    asked.push(plan(wanted));
    const pass = passes.find((candidate) => plan(candidate) === plan(wanted));
    if (!pass) throw new Error(`${photo}: no recorded pass ${plan(wanted)}`);
    return Promise.resolve(pass.lines);
  }, catalogue);
  return { ...read, asked, text: bagText(read.kept.lines, catalogue), chips: chipLines(read.kept.lines) };
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

describe("the founder's bag photos, read as the skin reads them", () => {
  it('reads maldaner / Elisabeth at 1200 px: the descriptor under the roaster, the tasting line and the country are no name', async () => {
    const read = await replay('maldaner-elisabeth.jpg');
    expect(read.text).toEqual({ roaster: 'maldaner', name: 'Elisabeth' });
    expect(read.asked).toEqual(['0 1200', '0 1200 inverted']);
    // without the catalogue the roaster is the line with no roaster's word on top
    expect(bagText(read.kept.lines).name).toBe('Elisabeth');
  });

  it('reads maldaner / Abdul: OMNI ROAST under the roaster is its descriptor', async () => {
    const read = await replay('maldaner-abdul.jpg');
    expect(read.text).toEqual({ roaster: 'maldaner', name: 'Abdul' });
    expect(read.chips).toEqual(['maldaner', 'Omni Roast', 'Abdul', 'Indonesien']);
  });

  it('reads aniko / Feel The Sun at 2800 px, its small print scaled up: the logo at the bottom is the roaster', async () => {
    const read = await replay('aniko-feel-the-sun.jpg');
    expect(read.asked).toEqual(['0 1200', '0 2800', '0 2800 inverted']);
    // a known bean of the roaster is offered as it is spelt in the catalogue
    expect(read.text).toEqual({ roaster: 'aniko', name: 'Feel the Sun' });
    expect(bagText(read.kept.lines, [{ roaster: 'aniko', name: 'Other', country: null }])).toEqual({
      roaster: 'aniko',
      name: 'Feel The Sun',
    });
  });

  it('turns the turned bag: upright no roaster of the catalogue and no name, turned by 270 degrees aniko and Honey', async () => {
    const read = await replay('aniko-honey-dream-rotated.jpg');
    const roasters = new Set(CATALOGUE.map((bean) => bean.roaster));
    const upright = bagText(read.passes[0].lines, CATALOGUE);
    expect(roasters.has(upright.roaster)).toBe(false);
    expect(upright.name).toBe('');
    expect(read.asked).toEqual([
      '0 1200',
      '0 1200 inverted',
      '90 1200',
      '90 1200 inverted',
      '270 1200',
      '270 2400',
      '270 2400 inverted',
    ]);
    expect(plan(read.kept)).toBe('270 2400');
    expect(read.text.roaster).toBe('aniko');
    // 'Dream' is lost under the blue cloud of the print at every size; 'Honey' is what is read
    expect(read.text.name).toBe('Honey');
    expect(read.chips).toEqual(['aniko', 'Coffee Roasters', 'Honey', 'mandel', 'honigmelone', 'pfirsich']);
  });

  it('keeps the descriptors and the tasting lines out of both fields', async () => {
    for (const { photo } of bags) {
      const { text } = await replay(photo);
      for (const field of [text.name, text.roaster])
        expect(field).not.toMatch(/kaffeehaus|omni|roast|haselnuss|vanilla|natural|brasilien|indonesien/i);
    }
  });

  it('does not turn a bag read upright', async () => {
    for (const photo of ['maldaner-elisabeth.jpg', 'maldaner-abdul.jpg', 'aniko-feel-the-sun.jpg']) {
      const { passes } = await replay(photo);
      expect(passes.every((pass) => pass.degrees === 0)).toBe(true);
    }
  });
});

describe('the passes', () => {
  const at = (height: number, confidence = 90, text = 'Words'): OcrLine => ({
    text,
    height,
    confidence,
    box: { x0: 0, y0: 0, x1: 10, y1: height },
  });

  it('measures the sure word-like lines by their median height', () => {
    expect(lineHeight([at(20), at(40), at(90)])).toBe(40);
    expect(lineHeight([at(20), at(40), at(90, 50), at(10, 90, '~ |')])).toBe(30);
    expect(lineHeight([])).toBe(0);
  });

  it('keeps a size whose lines are 30 to 50 px and scales others to about 36 px, in steps of 200 px from 800 to 2800', () => {
    expect(longSide(1200, [at(30)])).toBe(1200);
    expect(longSide(1200, [at(50)])).toBe(1200);
    expect(longSide(1200, [at(18)])).toBe(2400);
    expect(longSide(1200, [at(60)])).toBe(800);
    expect(longSide(1200, [at(13.5)])).toBe(2800);
    expect(longSide(1200, [at(3)])).toBe(2800);
    expect(longSide(1200, [at(29)])).toBe(1400);
    // nothing sure read: nothing to measure by
    expect(longSide(1200, [at(10, 30)])).toBe(1200);
  });

  it('scores a pass by the letters of its sure word-like lines', () => {
    expect(passScore([at(30, 90, 'Honey.'), at(30, 59, 'mandel'), at(30, 90, '2 4 6')])).toBe(5);
  });

  it('names the pass in the progress line', () => {
    expect(passWords({ degrees: 0, long: 1200, invert: false })).toBe('Reading the bag');
    expect(passWords({ degrees: 0, long: 1200, invert: true })).toBe('Reading the bag inverted');
    expect(passWords({ degrees: 90, long: 1200, invert: false })).toBe('Turning the photo');
    expect(passWords({ degrees: 270, long: 2400, invert: true })).toBe('Turning the photo');
  });

  it('keeps the inverted pass when it read more, and upright when no turn read more', async () => {
    const lines: Record<string, OcrLine[]> = {
      '0 1200': [at(40, 90, 'aniko')],
      '0 1200 inverted': [at(40, 90, 'aniko'), at(40, 90, 'Red Brick')],
    };
    const inverted = await readPasses(async (wanted) => Promise.resolve(lines[plan(wanted)] ?? []), []);
    expect(plan(inverted.kept)).toBe('0 1200 inverted');
    // no roaster of the catalogue and no name upright: both turns are read, and neither read more
    const turned = await readPasses(
      async (wanted) => Promise.resolve(wanted.degrees ? [] : [at(40, 90, 'COFFEE ROASTERS')]),
      CATALOGUE,
    );
    expect(turned.passes.map(plan)).toEqual([
      '0 1200',
      '0 1200 inverted',
      '90 1200',
      '90 1200 inverted',
      '270 1200',
      '270 1200 inverted',
    ]);
    expect(plan(turned.kept)).toBe('0 1200');
  });
});

describe('chipLines', () => {
  it('gives up to six of the lines read, cleaned as the fields get them, the tallest of more, in the order from the top', () => {
    top = 0;
    const lines = [
      line('ANIKO', 40),
      line('~ ~', 50),
      line('Tiny', 10),
      line('TROPIC CANDY', 70),
      line('unsure', 60, 40),
      line('Kolumbien', 30),
      line('250 g', 30),
      line('washed', 20),
      line('chocolate', 22),
      line('ANIKO', 40),
      line('peach', 21),
    ];
    expect(chipLines(lines)).toEqual(['Aniko', 'Tropic Candy', 'Kolumbien', 'chocolate', 'peach']);
    expect(chipLines([])).toEqual([]);
  });
});

describe('preparePixels', () => {
  const pixels = (...greys: number[]) => new Uint8ClampedArray(greys.flatMap((grey) => [grey, grey, grey, 255]));
  const greys = (rgba: Uint8ClampedArray) => [...rgba].filter((_, index) => index % 4 === 0);

  it('makes the picture grey and stretches its contrast between the 1st and the 99th percentile', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    preparePixels(rgba, false);
    // red 76, green 150, blue 29: stretched to 0..255
    expect(greys(rgba)).toEqual([99, 255, 0]);
    expect(rgba[1]).toBe(rgba[0]);
    expect(rgba[3]).toBe(255);
    // a grey picture of 100 to 140 is spread from 0 to 255
    const ramp = pixels(...Array.from({ length: 200 }, (_, index) => 100 + Math.floor((index * 41) / 200)));
    preparePixels(ramp, false);
    expect(Math.min(...greys(ramp))).toBe(0);
    expect(Math.max(...greys(ramp))).toBe(255);
  });

  it('inverts light on dark', () => {
    const rgba = pixels(0, 64, 255);
    preparePixels(rgba, true);
    expect(greys(rgba)).toEqual([255, 191, 0]);
  });

  it('makes a picture of one grey black', () => {
    const rgba = pixels(80, 80, 80);
    preparePixels(rgba, false);
    expect(greys(rgba)).toEqual([0, 0, 0]);
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
