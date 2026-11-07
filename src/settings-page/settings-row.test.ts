import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every row of the settings page is SettingsRow: no other component of the page writes a row,
// its frame or its value field again.
const DIR = import.meta.dirname;
const others = readdirSync(DIR).filter((name) => name.endsWith('.svelte') && name !== 'SettingsRow.svelte');

function style(name: string): string {
  return /<style[^>]*>([\s\S]*?)<\/style>/.exec(readFileSync(join(DIR, name), 'utf8'))?.[1] ?? '';
}

describe('SettingsRow', () => {
  it('is the only component of the settings page with a .row', () => {
    const found = others.filter((name) => /class="row\b/.test(readFileSync(join(DIR, name), 'utf8')) || /\.row\b/.test(style(name)));
    expect(found).toEqual([]);
  });

  it('draws the rows of every component that has them', () => {
    const rows = [
      'Bengle',
      'FieldRow',
      'Firmware',
      'Help',
      'LocalInstall',
      'MachineInfo',
      'Maintenance',
      'Plugins',
      'Presence',
      'SettingsPage',
      'SkinCategory',
      'Skins',
      'TankCalibration',
      'TankUnit',
    ];
    for (const name of rows) expect(readFileSync(join(DIR, `${name}.svelte`), 'utf8'), name).toContain('<SettingsRow');
  });

  // A sensor's line beside its readings is no row; its value field is its own.
  it('holds the value field: no row component writes its look again', () => {
    const found = others.filter((name) => name !== 'SensorCalibration.svelte' && /(^|\n)\s*\.value( b)?\s*\{/.test(style(name)));
    expect(found).toEqual([]);
  });
});
