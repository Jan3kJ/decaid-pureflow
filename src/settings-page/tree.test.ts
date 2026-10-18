import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY, LOCATION_KEY, SETTINGS_TREE, loadLocation, saveLocation } from './tree';

describe('the settings tree (research.md 20.3, 20.10 S2a)', () => {
  it("has Streamline's categories of S2a in its order and with its numbers", () => {
    expect(SETTINGS_TREE.map((category) => `${category.number}. ${category.name}`)).toEqual([
      '1. Quick Adjustments',
      '3. Calibration',
      '4. Machine',
      '6. Skin',
      '9. Miscellaneous',
    ]);
  });

  it("has Streamline's subcategories in its order", () => {
    const names = (id: string) => SETTINGS_TREE.find((category) => category.id === id)!.subcategories.map((sub) => sub.name);
    expect(names('quickadjustments')).toEqual([
      'Flow calibration',
      'Steam',
      'Hot Water',
      'Water Tank',
      'Flush',
      'Machine Advanced Settings',
    ]);
    expect(names('calibration')).toEqual(['Default load settings', 'Refill Kit', 'Voltage', 'Fan']);
    expect(names('machine')).toEqual(['USB']);
    expect(names('skin')).toEqual(['Steam', 'Hot water', 'Profile', 'Shot graph', 'Backup and version']);
    expect(names('miscellaneous')).toEqual(['Decaid Settings', 'Brightness', 'Wake Lock']);
  });

  it('leaves out what the port leaves out, and what S2b and S2c bring', () => {
    const all = SETTINGS_TREE.flatMap((category) => [category.name, ...category.subcategories.map((sub) => sub.name)]);
    for (const absent of [
      // Streamline's own, Bengle only, the skin switch, the manual (research.md 20.11)
      'Theme',
      'Active Skin',
      'Language',
      'Load Cells',
      'Cup Warmer',
      'Lighting',
      'Display Size',
      'Screen Saver',
      'Keyboard Shortcuts',
      'Home Assistant',
      'User Manual',
      // shown once, in Quick Adjustments
      'Calibration Steam',
      // S2b and S2c
      'Connections',
      'Maintenance',
      'Machine Information',
      'Sensor Calibration',
      'Extensions',
      'Presence Detection',
      'Updates',
    ]) {
      expect(all).not.toContain(absent);
    }
    expect(SETTINGS_TREE.find((category) => category.id === 'calibration')!.subcategories.map((sub) => sub.id)).not.toContain('steam');
  });

  it('keeps the category opened last, and opens on the first without one', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    expect(loadLocation(storage)).toBe(DEFAULT_CATEGORY);
    saveLocation('skin', storage);
    expect(store.get(LOCATION_KEY)).toBe('skin');
    expect(loadLocation(storage)).toBe('skin');
    store.set(LOCATION_KEY, 'language');
    expect(loadLocation(storage)).toBe(DEFAULT_CATEGORY);
  });
});
