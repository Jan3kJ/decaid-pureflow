import { describe, expect, it } from 'vitest';
import { bagFields } from './fields';
import type { BagLine, Turn } from './reading';
import { lineOf, mergeTurns } from './turns';

// The passes PP-OCRv6 tiny gives on the stored photos, upright, 90 and 270 degrees clockwise, as
// src/beans/read.ts gets them in Chromium with the boxes mapped back to the photo: text, score
// (three places), box (whole pixels) and turn, in the detector's order.
const line = (text: string, score: number, x: number, y: number, width: number, height: number, turn: Turn = 0): BagLine => ({
  text,
  score,
  box: { x, y, width, height },
  turn,
});

const CANDYMAN = [
  [
    line('backyard coffee', 0.994, 295, 189, 204, 28),
    line('NOWKO', 0.502, 520, 597, 167, 370, 270),
    line('mal', 0.986, 723, 805, 45, 28),
  ],
  [
    line('backyard coffee', 0.995, 295, 192, 205, 28),
    line('CDYMAN', 0.909, 519, 594, 156, 376, 90),
    line('GIOPIEN-NATURAL', 0.935, 529, 829, 22, 111, 90),
  ],
  [
    line('NIWAOTT', 0.636, 525, 595, 154, 366, 270),
    line('TAOIVN-NHO', 0.654, 529, 823, 26, 116, 270),
    line('0e pDe0a', 0.272, 294, 191, 208, 28, 180),
  ],
];
const RED_BRICK = [
  [
    line('SQUARE MILE COFFEE ROASTERS', 0.974, 36, 92, 566, 36),
    line('RED BRICK', 0.99, 84, 161, 475, 76),
    line('Espresso blend ·350g', 0.985, 186, 269, 265, 36),
  ],
  [
    line('SQUARE MILE COFFEE ROASTERS', 0.98, 37, 94, 565, 36),
    line('RED BRICK', 0.967, 80, 162, 477, 78),
    line('Espresso blend ·350g', 0.975, 186, 272, 266, 36),
  ],
  [
    line('SSOI00E∩0s', 0.371, 37, 93, 567, 36, 180),
    line('oaa', 0.413, 82, 158, 478, 82, 180),
    line('6oe·puelq osseuds', 0.664, 189, 271, 263, 36, 180),
  ],
];
const ELISABETH = [
  [
    line('maldaner', 1, 517, 46, 168, 42),
    line('KAFFEEHAUS ESPRESSO', 0.974, 509, 82, 184, 26),
    line('ELISABETH', 1, 479, 178, 241, 67),
    line('HASELNUSS. KAKAO. NOUGAT', 0.934, 518, 239, 149, 25),
    line('Brasilien', 1, 521, 320, 136, 49),
  ],
  [
    line('ELISABETH', 0.995, 475, 176, 248, 83),
    line('maldaner', 0.989, 509, 43, 178, 61),
    line('Brasilien', 0.958, 522, 324, 134, 51),
    line('A写', 0.19, 563, 251, 14, 7),
    line('KAKAO', 0.959, 581, 250, 41, 11),
  ],
  [
    line('HL38V5173', 0.681, 479, 175, 245, 79, 180),
    line('Jeuepie', 0.537, 516, 46, 175, 46, 180),
    line('GS63AS3 SAVHaVY', 0.423, 512, 82, 183, 27, 180),
    line('cllnr', 0.196, 525, 320, 135, 54, 180),
    line('OVHVN', 0.702, 582, 249, 38, 10, 180),
    line("'SsONasVH", 0.668, 524, 241, 59, 20, 180),
  ],
];
const FEEL_THE_SUN = [
  [
    line('FEEL THE SUN', 0.958, 482, 144, 141, 33),
    line('naturalG', 0.981, 485, 180, 66, 23),
    line('fully washed', 0.973, 485, 196, 89, 23),
    line('chocolate . vanilla ·bluebery', 0.932, 459, 264, 171, 30),
    line('aniko', 1, 364, 277, 69, 34),
    line('COrFEE ROASTEAS', 0.809, 371, 296, 60, 23),
  ],
  [
    line('fully washed', 0.971, 485, 199, 90, 23),
    line('natural G', 0.892, 482, 176, 73, 34),
    line('FEEL THE SUN', 0.972, 483, 147, 141, 32),
  ],
  [
    line('N∩S 3H⊥', 0.727, 484, 146, 141, 32, 180),
    line('petsDM fIn}', 0.576, 486, 197, 92, 23, 180),
    line('9101nIDu', 0.574, 484, 175, 75, 32, 180),
  ],
];
const HONEY_DREAM = [
  [
    line('Honey Dream', 0.996, 548, 157, 41, 164, 270),
    line('COFFEE ROASTERS', 0.965, 620, 154, 24, 135, 270),
    line('aniko', 1, 640, 148, 52, 143, 270),
    line('pfirsich', 0.993, 339, 166, 32, 63, 270),
    line('honigmelone', 0.999, 360, 165, 30, 97, 270),
    line('mandel', 0.999, 381, 166, 26, 59, 270),
  ],
  [
    line('p/5uyd', 0.603, 341, 171, 24, 56, 90),
    line('auoa8iuou', 0.455, 361, 169, 25, 95, 90),
    line('apUew', 0.696, 382, 171, 23, 55, 90),
    line('weaa KauoH', 0.638, 550, 158, 38, 167, 90),
    line('STOO', 0.331, 621, 157, 22, 135, 90),
    line('o!uD', 0.563, 639, 151, 57, 144, 90),
  ],
  [
    line('aniko', 1, 640, 148, 60, 144, 270),
    line('COFFEE ROASTERS', 0.991, 627, 156, 19, 132, 270),
    line('Honey Dream', 0.981, 557, 159, 28, 165, 270),
    line('mandel', 0.999, 386, 167, 22, 56, 270),
    line('honigmelone', 0.999, 365, 167, 26, 95, 270),
    line('pfirsich', 0.997, 341, 165, 33, 62, 270),
  ],
];

const texts = (lines: readonly BagLine[]) => lines.map((read) => read.text);

describe('lineOf', () => {
  // A 100 x 40 px box at (10, 20) of a 300 x 200 photo; the canvas of a turned pass is 200 x 300.
  const wide = (poly: [number, number][]) => ({ text: ' WORD ', score: 0.9, poly });

  it('keeps the box of the upright pass and trims the text', () => {
    const read = lineOf(
      wide([
        [10, 20],
        [110, 20],
        [110, 60],
        [10, 60],
      ]),
      0,
      300,
      200,
    );
    expect(read).toEqual({ text: 'WORD', score: 0.9, box: { x: 10, y: 20, width: 100, height: 40 }, turn: 0 });
  });

  it('maps a box of the pass turned by 90 degrees back to the photo', () => {
    // Clockwise by 90: a photo's point (x, y) is at (height - y, x) on the canvas.
    const read = lineOf(
      wide([
        [140, 10],
        [180, 10],
        [180, 110],
        [140, 110],
      ]),
      90,
      200,
      300,
    );
    expect(read.box).toEqual({ x: 10, y: 20, width: 100, height: 40 });
  });

  it('maps a box of the pass turned by 270 degrees back to the photo', () => {
    // Clockwise by 270: a photo's point (x, y) is at (y, width - x) on the canvas.
    const read = lineOf(
      wide([
        [20, 190],
        [60, 190],
        [60, 290],
        [20, 290],
      ]),
      270,
      200,
      300,
    );
    expect(read.box).toEqual({ x: 10, y: 20, width: 100, height: 40 });
  });

  it.each([
    [0, false, 0],
    [0, true, 270],
    [90, false, 90],
    [90, true, 0],
    [270, false, 270],
    [270, true, 180],
  ] as const)('pass %i, tall crop %s: the line stands at %i', (pass, tall, turn) => {
    const [width, height] = tall ? [40, 100] : [100, 40];
    const poly: [number, number][] = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ];
    expect(lineOf({ text: 'WORD', score: 1, poly }, pass, 300, 300).turn).toBe(turn);
  });
});

describe('mergeTurns', () => {
  it('the turned name takes the place of what the upright pass made of it', () => {
    const merged = mergeTurns(CANDYMAN);
    expect(texts(merged)).toEqual(['backyard coffee', 'CDYMAN', 'mal', 'GIOPIEN-NATURAL']);
    expect(merged[1]).toMatchObject({ turn: 90, box: { x: 519, y: 594 } });
    expect(bagFields(merged)).toEqual({
      name: 'Cdyman',
      roaster: 'Backyard Coffee',
      chips: ['Cdyman', 'Backyard Coffee', 'Mal', 'Giopien-Natural'],
    });
  });

  it('the same words in the same place count as one, with the better score', () => {
    const merged = mergeTurns(RED_BRICK);
    expect(texts(merged)).toEqual(['SQUARE MILE COFFEE ROASTERS', 'RED BRICK', 'Espresso blend ·350g']);
    expect(merged.map((read) => read.score)).toEqual([0.98, 0.99, 0.985]);
    expect(bagFields(merged).chips).toEqual(['Red Brick', 'Square Mile Coffee Roasters', 'Espresso blend ·350g']);
  });

  it('a piece of a line read better in another turn does not replace the line', () => {
    const merged = mergeTurns(ELISABETH);
    expect(texts(merged)).toEqual(['maldaner', 'KAFFEEHAUS ESPRESSO', 'ELISABETH', 'HASELNUSS. KAKAO. NOUGAT', 'Brasilien']);
    expect(bagFields(merged).chips).toEqual(['Elisabeth', 'Maldaner', 'Kaffeehaus Espresso']);
  });

  it("a pass's own lines stay apart even where their boxes overlap", () => {
    const merged = mergeTurns(FEEL_THE_SUN);
    expect(texts(merged)).toContain('COrFEE ROASTEAS');
    expect(bagFields(merged)).toEqual({
      name: 'Feel The Sun',
      roaster: 'Aniko',
      chips: ['Feel The Sun', 'Aniko', 'naturalG', 'Fully Washed'],
    });
  });

  it('a whole bag photographed on its side stays read', () => {
    const merged = mergeTurns(HONEY_DREAM);
    expect(merged.every((read) => read.turn === 270)).toBe(true);
    expect(bagFields(merged)).toEqual({
      name: 'Honey Dream',
      roaster: 'Aniko',
      chips: ['Honey Dream', 'Aniko', 'Pfirsich', 'Honigmelone', 'Mandel'],
    });
  });

  it('a whole line replaces a piece of it read first', () => {
    const merged = mergeTurns([[line('KAKAO', 0.99, 50, 0, 40, 10)], [line('KAKAO NOUGAT', 0.8, 0, 0, 200, 12)]]);
    expect(texts(merged)).toEqual(['KAKAO NOUGAT']);
  });

  it('leaves out lines read less surely than 0.5 and empty ones, and gives nothing for no lines', () => {
    expect(mergeTurns([[line('BLURRED', 0.49, 0, 0, 100, 20)], [line('', 1, 200, 0, 100, 20)]])).toEqual([]);
    expect(mergeTurns([[], [], []])).toEqual([]);
  });
});
