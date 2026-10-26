import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY, LOCATION_KEY, SETTINGS_TREE, loadLocation, saveLocation, visibleSubcategories } from './tree';

describe('the settings tree (research.md 20.3, 20.10 S2a)', () => {
  it("has Streamline's categories of S2 in its order and with its numbers", () => {
    expect(SETTINGS_TREE.map((category) => `${category.number}. ${category.name}`)).toEqual([
      '1. Quick Adjustments',
      '2. Connections',
      '3. Calibration',
      '4. Machine',
      '5. Maintenance',
      '6. Skin',
      '8. Extensions',
      '9. Miscellaneous',
      '10. Updates',
      '11. User Manual',
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
    expect(names('calibration')).toEqual([
      'Default load settings',
      'Refill Kit',
      'Voltage',
      'Fan',
      'Sensor Calibration',
      'Load Cells',
    ]);
    expect(names('bluetooth')).toEqual(['1. Machine', '2. Scale']);
    expect(names('machine')).toEqual(['USB', 'Cup Warmer', 'Lighting', 'Machine Information']);
    expect(names('maintenance')).toEqual(['Clean', 'Machine Descaling', 'Transport Mode']);
    expect(names('skin')).toEqual([
      'Steam',
      'Hot water',
      'Profile',
      'Shot graph',
      'Display Size',
      'Active Skin',
      'Backup and version',
    ]);
    expect(names('miscellaneous')).toEqual(['Decaid Settings', 'Brightness', 'Wake Lock', 'Presence Detection']);
    // Visualizer and Shot Uploader are plugin cards of Plugins (research.md 20.3).
    expect(names('extensions')).toEqual(['Plugins']);
    expect(names('updates')).toEqual(['Firmware Update', 'Decaid']);
    expect(names('usermanual')).toEqual(['Quick Start Guide', 'Send Feedback']);
  });

  it('leaves out what the port leaves out', () => {
    const all = SETTINGS_TREE.flatMap((category) => [category.name, ...category.subcategories.map((sub) => sub.name)]);
    for (const absent of [
      // Streamline's own, Bengle only, the manual (research.md 20.11)
      'Theme',
      'Language',
      'Temperature',
      'Screen Saver',
      'Keyboard Shortcuts',
      'Home Assistant',
      // shown once, in Quick Adjustments
      'Calibration Steam',
      // a Decent account (spec 3.9 item 15)
      'Talk to Decent',
    ]) {
      expect(all).not.toContain(absent);
    }
    expect(SETTINGS_TREE.find((category) => category.id === 'calibration')!.subcategories.map((sub) => sub.id)).not.toContain('steam');
  });

  it('draws the device lists, the procedures, the machine information (S2b), the plugins, the schedules, the firmware and the sensors (S2c) with their views', () => {
    const views = SETTINGS_TREE.flatMap((category) =>
      category.subcategories.map((sub) => [sub.id, sub.content.kind === 'fields' ? (sub.content.view ?? null) : null]),
    ).filter(([, view]) => view !== null);
    expect(Object.fromEntries(views)).toEqual({
      ble_machine: { kind: 'devices', devices: 'machine' },
      ble_scale: { kind: 'devices', devices: 'scale' },
      usbchargermode: { kind: 'charging' },
      machineinfo: { kind: 'machine-info' },
      machinecleaning: { kind: 'maintenance', procedure: 'clean' },
      machinedescaling: { kind: 'maintenance', procedure: 'descale' },
      transportmode: { kind: 'maintenance', procedure: 'transport' },
      sensors: { kind: 'sensors' },
      watertank: { kind: 'tank-unit' },
      extention2: { kind: 'plugins' },
      presence: { kind: 'presence' },
      firmwareupdate: { kind: 'firmware' },
      appupdate: { kind: 'app-update' },
      loadcell: { kind: 'bengle', part: 'load-cells' },
      cupwarmer: { kind: 'bengle', part: 'cup-warmer' },
      ledstrip: { kind: 'bengle', part: 'lighting' },
      quickstart: { kind: 'help', part: 'manual' },
      feedback: { kind: 'help', part: 'feedback' },
    });
  });

  it("shows the Bengle's pages only on a Bengle", () => {
    const shown = (bengle: boolean) =>
      SETTINGS_TREE.flatMap((category) => visibleSubcategories(category, bengle))
        .filter((sub) => sub.bengle)
        .map((sub) => sub.id);
    expect(shown(false)).toEqual([]);
    expect(shown(true)).toEqual(['loadcell', 'cupwarmer', 'ledstrip']);
  });

  it('keeps the category opened last, and opens on the first without one', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(loadLocation(storage)).toBe(DEFAULT_CATEGORY);
    saveLocation('skin', storage);
    expect(store.get(LOCATION_KEY)).toBe('skin');
    expect(loadLocation(storage)).toBe('skin');
    store.set(LOCATION_KEY, 'language');
    expect(loadLocation(storage)).toBe(DEFAULT_CATEGORY);
  });
});
