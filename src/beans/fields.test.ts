import { describe, expect, it } from 'vitest';
import { bagFields, titleCase } from './fields';
import type { BagLine } from './reading';

// The lines PP-OCRv6 tiny reads on four bags' photos (each scaled to the stored 1024 x 768 px), as
// src/beans/read.ts gives them in Chromium: text, score (two places) and box (whole pixels), in the
// detector's order. The last bag was photographed turned on its side and is read as taken.
const line = (text: string, score: number, x: number, y: number, width: number, height: number): BagLine => ({
  text,
  score,
  box: { x, y, width, height },
});

const ELISABETH = [
  line('maldaner', 1, 517, 46, 168, 42),
  line('KAFFEEHAUS ESPRESSO', 0.97, 509, 82, 184, 26),
  line('ELISABETH', 1, 479, 178, 241, 67),
  line('HASELNUSS. KAKAO. NOUGAT', 0.93, 518, 239, 149, 25),
  line('Brasilien', 1, 521, 320, 136, 49),
];
const ABDUL = [
  line('maldaner', 1, 451, 40, 170, 39),
  line('OMNIROAST', 1, 489, 78, 89, 18),
  line('ABDUL', 1, 441, 181, 187, 66),
  line('Indonesien', 1, 446, 328, 173, 52),
];
const FEEL_THE_SUN = [
  line('FEEL THE SUN', 0.96, 482, 144, 141, 33),
  line('naturalG', 0.98, 485, 180, 66, 23),
  line('fully washed', 0.97, 485, 196, 89, 23),
  line('chocolate . vanilla ·bluebery', 0.93, 459, 264, 171, 30),
  line('aniko', 1, 364, 277, 69, 34),
  line('COrFEE ROASTEAS', 0.81, 371, 296, 60, 23),
];
const HONEY_DREAM = [
  line('Honey Dream', 1, 548, 157, 41, 164),
  line('COFFEE ROASTERS', 0.97, 620, 154, 24, 135),
  line('aniko', 1, 640, 148, 52, 143),
  line('pfirsich', 0.99, 339, 166, 32, 63),
  line('honigmelone', 1, 360, 165, 30, 97),
  line('mandel', 1, 381, 166, 26, 59),
];

describe('bagFields on the four bags', () => {
  it.each([
    ['Elisabeth', ELISABETH, 'Elisabeth', 'Maldaner'],
    ['Abdul', ABDUL, 'Abdul', 'Maldaner'],
    ['Feel The Sun', FEEL_THE_SUN, 'Feel The Sun', 'Aniko'],
    ['Honey Dream, turned', HONEY_DREAM, 'Honey Dream', 'Aniko'],
  ])('%s: name and roaster with an empty catalogue', (_, lines, name, roaster) => {
    const fields = bagFields(lines);
    expect(fields).toMatchObject({ name, roaster });
    expect(fields.chips.slice(0, 2)).toEqual([name, roaster]);
  });

  it.each([
    ['Elisabeth', ELISABETH, 'Elisabeth', 'maldaner'],
    ['Abdul', ABDUL, 'Abdul', 'maldaner'],
    ['Feel The Sun', FEEL_THE_SUN, 'Feel The Sun', 'aniko'],
    ['Honey Dream, turned', HONEY_DREAM, 'Honey Dream', 'aniko'],
  ])("%s: the catalogue's roaster in its own spelling", (_, lines, name, roaster) => {
    const fields = bagFields(lines, ['aniko', 'maldaner']);
    expect(fields).toMatchObject({ name, roaster });
    expect(fields.chips.slice(0, 2)).toEqual([name, roaster]);
  });

  it('offers no tasting line, country or Coffee Roasters line as a chip', () => {
    expect(bagFields(ELISABETH).chips).toEqual(['Elisabeth', 'Maldaner', 'Kaffeehaus Espresso']);
    expect(bagFields(ABDUL).chips).toEqual(['Abdul', 'Maldaner', 'Omniroast']);
    expect(bagFields(FEEL_THE_SUN).chips).toEqual(['Feel The Sun', 'Aniko', 'naturalG', 'Fully Washed']);
    expect(bagFields(HONEY_DREAM).chips).toEqual(['Honey Dream', 'Aniko', 'Pfirsich', 'Honigmelone', 'Mandel']);
  });

  it('leaves out a small line right under the roaster as the name', () => {
    // OMNIROAST is right under maldaner and half its height: not the name, even when ABDUL is not read.
    const fields = bagFields(ABDUL.filter((read) => read.text !== 'ABDUL'));
    expect(fields.name).toBe('Maldaner');
    expect(fields.chips).not.toContain('Indonesien');
  });

  it("takes the line right below the name when none is above, and the catalogue's countries", () => {
    const lines = [
      line('Sitio Canaa', 1, 100, 100, 300, 60),
      line('Fazenda Roasting', 1, 110, 180, 260, 40),
      line('Minas', 1, 110, 240, 100, 40),
    ];
    expect(bagFields(lines, [], ['Minas'])).toEqual({
      name: 'Sitio Canaa',
      roaster: 'Fazenda Roasting',
      chips: ['Sitio Canaa', 'Fazenda Roasting'],
    });
  });

  it('leaves out lines read less surely than 0.5 and lines without two letters', () => {
    const lines = [line('BLURRED', 0.3, 0, 0, 400, 90), line('250 g', 1, 0, 100, 100, 50), line('Kenia', 1, 0, 200, 100, 30)];
    expect(bagFields(lines)).toEqual({ name: '', roaster: '', chips: [] });
  });

  it('a bag with no line gives nothing', () => {
    expect(bagFields([])).toEqual({ name: '', roaster: '', chips: [] });
  });
});

describe('titleCase', () => {
  it('turns capitals and small letters into title case and keeps a mixed line', () => {
    expect(titleCase('FEEL THE SUN')).toBe('Feel The Sun');
    expect(titleCase('maldaner')).toBe('Maldaner');
    expect(titleCase('ÄTHIOPIEN GUJI-HAMBELA')).toBe('Äthiopien Guji-Hambela');
    expect(titleCase('Honey Dream')).toBe('Honey Dream');
    expect(titleCase('naturalG')).toBe('naturalG');
  });
});
