import { describe, expect, it } from 'vitest';
import { HOT_WATER_FIELDS } from '../hotwater/hot-water';
import {
  FAST_START,
  FLUSH,
  PRESENCE,
  SCALE,
  STEAM_TEMPERATURE,
  USB,
  clock,
  heldNumber,
  minutesOf,
  padMin,
  shownValue,
  type Field,
  type NumberField,
} from './fields';
import { TREE_FIELDS } from './tree';

const byId = (id: string) => TREE_FIELDS.find((field) => field.id === id)!;
const numberField = (id: string) => byId(id) as NumberField;

describe('the fields of the settings page (research.md 20.3)', () => {
  // Streamline's ranges and steps (src/settings/settings.js, v0.2.14), and the source of each.
  const EXPECTED: [string, Field['source'], string, number, number, number][] = [
    ['weight-flow-multiplier', 'decaid', 'weightFlowMultiplier', 0, 5, 0.1],
    ['volume-flow-multiplier', 'decaid', 'volumeFlowMultiplier', 0, 2, 0.05],
    ['steam-temperature', 'workflow.steamSettings', 'targetTemperature', 135, 165, 1],
    ['steam-flow', 'workflow.steamSettings', 'flow', 0.4, 2.5, 0.1],
    ['hot-water-temperature', 'workflow.hotWaterData', 'targetTemperature', 50, 95, 1],
    ['hot-water-weight', 'workflow.hotWaterData', 'volume', 10, 500, 1],
    ['hot-water-time', 'workflow.hotWaterData', 'duration', 5, 120, 1],
    ['hot-water-flow', 'workflow.hotWaterData', 'flow', 0.1, 10, 0.1],
    ['hot-water-flow-multiplier', 'decaid', 'hotWaterFlowMultiplier', 0, 2, 0.05],
    ['tank-temperature', 'machine', 'tankTemp', 10, 40, 1],
    ['water-alert', 'waterLevels', 'refillLevel', 0, 30, 5],
    ['flush-temperature', 'workflow.rinseData', 'targetTemperature', 5, 95, 1],
    ['flush-flow', 'workflow.rinseData', 'flow', 1, 8, 0.1],
    ['flush-duration', 'workflow.rinseData', 'duration', 1, 120, 1],
    ['heater-idle-temperature', 'advanced', 'heaterIdleTemp', 0, 99, 1],
    ['heater-warmup-flow', 'advanced', 'heaterPh1Flow', 0, 10, 0.1],
    ['heater-test-flow', 'advanced', 'heaterPh2Flow', 0, 10, 0.1],
    ['heater-test-timeout', 'advanced', 'heaterPh2Timeout', 0, 60, 1],
    ['fan-threshold', 'machine', 'fan', 0, 50, 1],
    ['brightness', 'display', 'requestedBrightness', 0, 100, 1],
    ['sleep-timeout', 'presence', 'sleepTimeoutMinutes', 1, 120, 1],
  ];

  it.each(EXPECTED)('%s: %s %s, %d to %d in steps of %d', (id, source, key, min, max, step) => {
    const field = numberField(id);
    expect(field.kind).toBe('number');
    expect([field.source, field.key, field.min, field.max, field.step]).toEqual([source, key, min, max, step]);
  });

  it('has every number field of the tree in that list', () => {
    const numbers = TREE_FIELDS.filter((field) => field.kind === 'number').map((field) => field.id);
    expect(numbers.sort()).toEqual(EXPECTED.map(([id]) => id).sort());
  });

  it('the choices: steam purge, refill kit, voltage, gateway mode, charging mode, log level', () => {
    const options = (id: string) => (byId(id) as Extract<Field, { kind: 'choice' }>).options.map((option) => option.value);
    expect(options('steam-purge-mode')).toEqual([0, 1]);
    expect(options('refill-kit')).toEqual([2, 1, 0]);
    expect(options('heater-voltage')).toEqual([120, 230]);
    expect(options('gateway-mode')).toEqual(['disabled', 'tracking', 'full']);
    expect(options('charging-mode')).toEqual(['disabled', 'highAvailability', 'balanced', 'longevity']);
    expect(options('log-level')).toHaveLength(10);
    expect(options('scale-power-mode')).toEqual(['disabled', 'displayOff', 'disconnect']);
  });

  it('asks before the voltage and the gateway mode, and before nothing else (research.md 20.9)', () => {
    expect(TREE_FIELDS.filter((field) => field.confirm).map((field) => field.id)).toEqual(['heater-voltage', 'gateway-mode']);
  });

  it('no field is in two places: one id and one source key each', () => {
    const ids = TREE_FIELDS.map((field) => field.id);
    const places = TREE_FIELDS.map((field) => `${field.source}/${field.key}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(places).size).toBe(places.length);
  });

  it("takes the hot water page's ranges, one definition for both pages", () => {
    for (const page of HOT_WATER_FIELDS) {
      const field = numberField(`hot-water-${page.id}`);
      expect([field.key, field.min, field.max, field.unit]).toEqual([page.key, page.min, page.max, page.unit]);
    }
  });

  it('presence is a switch and the sleep timeout a number of /api/v1/presence/settings (S2c)', () => {
    expect(PRESENCE.map((field) => [field.kind, field.source, field.key])).toEqual([
      ['switch', 'presence', 'userPresenceEnabled'],
      ['number', 'presence', 'sleepTimeoutMinutes'],
    ]);
  });

  it("the scale's settings are Decaid's scalePowerMode and blockOnNoScale (S2b)", () => {
    expect(SCALE.map((field) => [field.kind, field.source, field.key])).toEqual([
      ['choice', 'decaid', 'scalePowerMode'],
      ['switch', 'decaid', 'blockOnNoScale'],
    ]);
  });

  it("writes the USB charger as 'enable' / 'disable' (research.md 20.4)", () => {
    const usb = USB.find((field) => field.id === 'usb-charger');
    expect(usb).toMatchObject({ kind: 'switch', source: 'machine', key: 'usb', written: { on: 'enable', off: 'disable' } });
  });

  it("Fast Start Defaults are insight-js's cafe preset", () => {
    expect(FAST_START).toEqual({ heaterIdleTemp: 99, heaterPh1Flow: 2, heaterPh2Flow: 4, heaterPh2Timeout: 1 });
  });

  it("the flush is the workflow's rinseData: temperature, flow and duration (founder, 2026-10-17)", () => {
    expect(FLUSH.map((field) => [field.source, field.key])).toEqual([
      ['workflow.rinseData', 'targetTemperature'],
      ['workflow.rinseData', 'flow'],
      ['workflow.rinseData', 'duration'],
    ]);
  });
});

describe('heldNumber', () => {
  it('rounds to the step and holds the range', () => {
    expect(heldNumber(numberField('volume-flow-multiplier'), 0.33)).toBe(0.35);
    expect(heldNumber(numberField('volume-flow-multiplier'), 0.32)).toBe(0.3);
    expect(heldNumber(numberField('water-alert'), 12)).toBe(10);
    expect(heldNumber(numberField('water-alert'), 13)).toBe(15);
    expect(heldNumber(numberField('fan-threshold'), 80)).toBe(50);
    expect(heldNumber(numberField('flush-flow'), 4.25)).toBe(4.3);
  });

  it('writes a steam temperature under 135 °C as 0, the heater off', () => {
    expect(padMin(STEAM_TEMPERATURE)).toBe(0);
    expect(heldNumber(STEAM_TEMPERATURE, 0)).toBe(0);
    expect(heldNumber(STEAM_TEMPERATURE, 120)).toBe(0);
    expect(heldNumber(STEAM_TEMPERATURE, 150)).toBe(150);
    expect(heldNumber(STEAM_TEMPERATURE, 170)).toBe(165);
  });
});

describe('the voltage and the night mode times', () => {
  it('reads a committed voltage above 1000 minus 1000', () => {
    const voltage = byId('heater-voltage');
    expect(shownValue(voltage, 1230)).toBe(230);
    expect(shownValue(voltage, 120)).toBe(120);
  });

  it('shows minutes since midnight as hh:mm and reads hhmm back', () => {
    expect(clock(1320)).toBe('22:00');
    expect(clock(420)).toBe('07:00');
    expect(minutesOf(2215)).toBe(1335);
    expect(minutesOf(705)).toBe(425);
    expect(minutesOf(2400)).toBeNull();
    expect(minutesOf(1260)).toBeNull();
  });
});
