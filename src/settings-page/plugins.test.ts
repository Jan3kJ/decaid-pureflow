import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '../api';
import {
  STATUS_LABEL,
  controlKind,
  isStored,
  pluginControls,
  pluginStatus,
  secureIsSet,
  shownValue,
  sortedPlugins,
  written,
} from './plugins';

/** The visualizer plugin as the rig's Decaid 0.8.8 lists it, with an enum added. */
const VISUALIZER: PluginManifest = {
  id: 'visualizer.reaplugin',
  name: 'Visualizer',
  version: '1.5.10',
  loaded: true,
  source: null,
  settings: {
    Username: { type: 'string', label: 'User name', description: 'Your visualizer.coffee login' },
    Password: { type: 'string', secure: true, description: 'Your password' },
    AutoUpload: { type: 'boolean', label: '  ', default: true },
    LengthThreshold: { type: 'number', default: 5 },
    Mode: { type: 'enum', values: ['all', 'espresso'], default: 'all' },
    Internal: { type: 'string', hidden: true },
    Broken: { type: 'enum' },
  },
};

const control = (key: string) => pluginControls(VISUALIZER).find((entry) => entry.key === key)!;

describe('the plugin cards', () => {
  it('has one control per declared setting, in the manifest order, of each type', () => {
    expect(pluginControls(VISUALIZER).map((entry) => [entry.key, entry.kind])).toEqual([
      ['Username', 'string'],
      ['Password', 'secure'],
      ['AutoUpload', 'boolean'],
      ['LengthThreshold', 'number'],
      ['Mode', 'enum'],
    ]);
    // A hidden one and an enum without values get none.
    expect(controlKind({ type: 'enum' })).toBeNull();
  });

  it("takes the manifest's label, else the key, and its description", () => {
    expect([control('Username').label, control('Username').description]).toEqual(['User name', 'Your visualizer.coffee login']);
    expect(control('AutoUpload').label).toBe('AutoUpload');
    expect(control('Mode').values).toEqual(['all', 'espresso']);
  });

  it('shows the stored value, else the default', () => {
    const schema = VISUALIZER.settings!;
    const stored = { Username: 'janek', LengthThreshold: 8 };
    expect(shownValue(control('Username'), schema.Username, stored)).toBe('janek');
    expect(shownValue(control('LengthThreshold'), schema.LengthThreshold, stored)).toBe(8);
    expect(shownValue(control('AutoUpload'), schema.AutoUpload, stored)).toBe(true);
    expect(shownValue(control('Mode'), schema.Mode, {})).toBe('all');
    expect(shownValue(control('Username'), schema.Username, {})).toBeNull();
    expect(isStored(control('LengthThreshold'), stored)).toBe(true);
    expect(isStored(control('AutoUpload'), stored)).toBe(false);
  });

  it('never shows a secure value: only whether one is stored', () => {
    const schema = VISUALIZER.settings!.Password;
    expect(shownValue(control('Password'), schema, { Password: { isSet: true } })).toBe('Saved');
    expect(shownValue(control('Password'), schema, { Password: { isSet: false } })).toBe('Not set');
    expect(shownValue(control('Password'), schema, {})).toBe('Not set');
    // Even a gateway that sent the text would not get it on the page.
    expect(shownValue(control('Password'), schema, { Password: 'hunter2' })).toBe('Not set');
    expect(secureIsSet({ isSet: true })).toBe(true);
    expect(secureIsSet('hunter2')).toBe(false);
  });

  it('writes a number that is finite and not negative, a trimmed string, a secure value as typed, an enum value', () => {
    expect(written(control('LengthThreshold'), 7.5)).toBe(7.5);
    expect(written(control('LengthThreshold'), '12')).toBe(12);
    expect(written(control('LengthThreshold'), -1)).toBeNull();
    expect(written(control('LengthThreshold'), Number.NaN)).toBeNull();
    expect(written(control('Username'), '  janek ')).toBe('janek');
    expect(written(control('Password'), ' pass word ')).toBe(' pass word ');
    // An empty secure field keeps the stored one.
    expect(written(control('Password'), '')).toBeNull();
    expect(written(control('AutoUpload'), false)).toBe(false);
    expect(written(control('AutoUpload'), 'yes')).toBeNull();
    expect(written(control('Mode'), 'espresso')).toBe('espresso');
    expect(written(control('Mode'), 'other')).toBeNull();
  });

  it("says what is known of a plugin's updates", () => {
    const at = (patch: Partial<PluginManifest>) => pluginStatus({ ...VISUALIZER, ...patch });
    expect(at({ loaded: false })).toBe('disabled');
    expect(at({ pendingUpdate: { version: '0.2.0', addedPermissions: ['network.tcp'] } })).toBe('update-pending');
    expect(at({ source: null })).toBe('bundled');
    expect(at({ source: { kind: 'local_zip' } })).toBe('untracked');
    expect(at({ source: { kind: 'github_release', lastError: 'rate limited' } })).toBe('check-failed');
    expect(at({ source: { kind: 'github_release', lastChecked: null } })).toBe('never-checked');
    expect(at({ source: { kind: 'github_branch', lastChecked: '2026-10-18T06:00:00Z' } })).toBe('checked');
    expect(STATUS_LABEL.checked).not.toMatch(/up to date/i);
  });

  it('lists the plugins by name', () => {
    const list = sortedPlugins([
      { id: 'time-to-ready.reaplugin', name: 'Time to ready' },
      { id: 'dye2.reaplugin', name: 'DYE2' },
      { id: 'b.reaplugin' },
    ]);
    expect(list.map((plugin) => plugin.id)).toEqual(['b.reaplugin', 'dye2.reaplugin', 'time-to-ready.reaplugin']);
  });
});
