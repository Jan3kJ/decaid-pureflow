import { describe, expect, it } from 'vitest';
import { filterSettings, type Shown } from './settings-filter';

const SHOWN: Shown = { bengle: false, developer: false, offered: () => true };
const subs = (filter: string, shown = SHOWN) => filterSettings(filter, shown).map((hit) => hit.sub.id);
const rows = (filter: string, id: string, shown = SHOWN) => [
  ...(filterSettings(filter, shown).find((hit) => hit.sub.id === id)?.rows ?? []),
];

describe('the settings filter', () => {
  it('finds nothing for an empty filter, which gives the page back', () => {
    expect(filterSettings('', SHOWN)).toEqual([]);
    expect(filterSettings('   ', SHOWN)).toEqual([]);
  });

  it('finds a word in every category, the machine rows and the skin rows alike', () => {
    expect(subs('mugs')).toEqual(['skin-steam']);
    expect(subs('steam')).toEqual(expect.arrayContaining(['steam', 'skin-steam']));
    expect(rows('legend', 'skin-graph')).toEqual(['show-graph-legend']);
  });

  it('reads the label and the hint of a row, case-blind', () => {
    expect(rows('MEDIUM FITS', 'skin-display')).toEqual(['display-size']);
    expect(rows('multiplier', 'flowmultiplier')).toEqual(['weight-flow-multiplier', 'volume-flow-multiplier']);
    expect(rows('stops earlier', 'flowmultiplier')).toEqual(['weight-flow-multiplier']);
  });

  it('needs every word, in any order, with the names of the subcategory and the category', () => {
    expect(subs('mugs skin')).toEqual(['skin-steam']);
    expect(subs('skin mugs')).toEqual(['skin-steam']);
    expect(subs('mugs quick')).toEqual([]);
    expect(rows('steam skin', 'skin-steam')).toHaveLength(4);
  });

  it('finds a word of no row nowhere', () => {
    expect(subs('xylophone')).toEqual([]);
  });

  it('finds a view by the name of its subcategory, not by its hint', () => {
    expect(subs('plugins')).toEqual(['extention2']);
    expect(filterSettings('plugins', SHOWN)[0].whole).toBe(true);
    expect(subs('visualizer')).toEqual([]);
    expect(subs('maintenance clean')).toEqual(['detergentclean', 'machinecleaning']);
    expect(subs('detergent')).toEqual(['detergentclean']);
    expect(subs('active skin')).toEqual(['skin-active']);
  });

  it('leaves a subcategory of rows and a view without its view when only a row is found', () => {
    const alert = filterSettings('level alert', SHOWN).find((entry) => entry.sub.id === 'watertank')!;
    expect([...alert.rows]).toHaveLength(1);
    expect(alert.whole).toBe(false);
    const tank = filterSettings('water tank', SHOWN).find((entry) => entry.sub.id === 'watertank')!;
    expect(tank.whole).toBe(true);
  });

  it("keeps the Bengle's rows hidden on another machine and the developer's without its switch", () => {
    expect(subs('cup warmer')).toEqual([]);
    expect(subs('cup warmer', { ...SHOWN, bengle: true })).toEqual(['cupwarmer']);
    expect(subs('developer')).toEqual(['skin-backup']);
    expect(subs('skin developer', { ...SHOWN, developer: true })).toEqual(['skin-backup', 'skin-developer']);
  });

  it('finds an action only where the page offers it', () => {
    expect(rows('dashboard', 'reasettings')).toEqual(['dashboard']);
    expect(subs('go to dashboard', { ...SHOWN, offered: (action) => action !== 'dashboard' })).toEqual([]);
  });
});
