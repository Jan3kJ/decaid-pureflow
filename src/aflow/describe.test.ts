import { describe, expect, it } from 'vitest';
import bundled from '../steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { DEFAULT_PROFILES } from './defaults';
import { describeAFlow } from './describe';
import { readSteps, type StoredProfile } from './reader';
import type { AFlowParams } from './types';

const medium = DEFAULT_PROFILES.find((entry) => entry.id === 'default-medium')!.params;
const floral = DEFAULT_PROFILES.find((entry) => entry.id === 'default-floral')!.params;
const changed = (changes: Partial<AFlowParams>, from: AFlowParams = medium): AFlowParams => ({ ...from, ...changes });

describe('describeAFlow', () => {
  it('describes the five defaults', () => {
    expect(Object.fromEntries(DEFAULT_PROFILES.map((entry) => [entry.id, describeAFlow(entry.params)]))).toEqual({
      'default-floral':
        '16 g in, 48 g out, a ratio of 1:3. Fills at 8 ml/s until 3 bar or 15 s, at 95 °C. Infuses at 0 bar, 1 ml/s at most, for 60 s or until 6 g. A second fill at 8 ml/s, then a pause of up to 15 s. Ramps to 9.5 bar in 10 s, then pours at 3 ml/s, rising to 6 ml/s over 60 s.',
      'default-light':
        '16 g in, 48 g out, a ratio of 1:3. Fills at 8 ml/s until 3 bar or 15 s, at 95 °C. Infuses at 3 bar, 1 ml/s at most, for 60 s or until 6 g. Ramps to 9.5 bar in 10 s, then pours at 3 ml/s, rising to 6 ml/s over 60 s.',
      'default-medium':
        '16 g in, 42 g out, a ratio of 1:2.6. Fills at 8 ml/s until 3 bar or 15 s, at 93 °C. Infuses at 3 bar, 1 ml/s at most, for 60 s or until 3.6 g. Ramps to 10 bar in 10 s, then pours at 2 ml/s, rising to 4 ml/s over 60 s.',
      'default-dark':
        '16 g in, 36 g out, a ratio of 1:2.3. Fills at 8 ml/s until 3 bar or 15 s, at 93 °C. Infuses at 3 bar, 1 ml/s at most, for 10 s or until 2 g. Ramps to 9 bar in 5 s, at 88 °C, then pours at 2 ml/s, falling to 0 ml/s over 60 s.',
      'default-46mm':
        '16 g in, 32 g out, a ratio of 1:2. Fills at 8 ml/s until 3 bar or 15 s, at 93 °C. Infuses at 3 bar, 1 ml/s at most, for 6 s or until 2 g. Ramps to 9 bar in 40 s, at 88 °C, then pours at 1.8 ml/s, falling to 0 ml/s over 60 s.',
    });
  });

  it('leaves out an infuse that does not last', () => {
    expect(describeAFlow(changed({ infuseTime: 0 }))).toBe(
      '16 g in, 42 g out, a ratio of 1:2.6. Fills at 8 ml/s until 3 bar or 15 s, at 93 °C. Ramps to 10 bar in 10 s, then pours at 2 ml/s, rising to 4 ml/s over 60 s.',
    );
  });

  it('names the 2nd fill and its pause only when they are on', () => {
    expect(describeAFlow(floral)).toContain('A second fill at 8 ml/s, then a pause of up to 15 s.');
    expect(describeAFlow(changed({ pauseDuration: 0 }, floral))).not.toContain('second fill');
    expect(describeAFlow(changed({ pauseDuration: 20, secondFillFlow: 6.5 }))).toContain(
      'Infuses at 3 bar, 1 ml/s at most, for 60 s or until 3.6 g. A second fill at 6.5 ml/s, then a pause of up to 20 s. Ramps',
    );
  });

  it('leaves out a fill that does not last, and then names the temperature with the next phase', () => {
    expect(describeAFlow(changed({ fillTime: 0 }))).toBe(
      '16 g in, 42 g out, a ratio of 1:2.6. Infuses at 3 bar, 1 ml/s at most, for 60 s or until 3.6 g, at 93 °C. Ramps to 10 bar in 10 s, then pours at 2 ml/s, rising to 4 ml/s over 60 s.',
    );
  });

  it('says the flow falls for flow down, rises for flow up, and stays for an end flow of the start', () => {
    expect(describeAFlow(changed({ flowUp: false }))).toContain('then pours at 2 ml/s, falling to 0 ml/s over 60 s.');
    expect(describeAFlow(changed({ pourEndFlow: 1.2 }))).toContain('then pours at 2 ml/s, falling to 1.2 ml/s over 60 s.');
    expect(describeAFlow(changed({ pourEndFlow: 5, pourTime: 40 }))).toContain('rising to 5 ml/s over 40 s.');
    expect(describeAFlow(changed({ pourEndFlow: 2 }))).toContain('then pours at 2 ml/s for 60 s.');
  });

  it('says "No stop weight." without one', () => {
    expect(describeAFlow(changed({ stopWeight: 0 }))).toMatch(/^No stop weight\. Fills at 8 ml\/s/);
  });

  it('leaves the dose and the ratio out where the dose is not the profile’s own', () => {
    expect(describeAFlow(medium, { dose: false })).toMatch(/^42 g out\. Fills/);
  });

  it('names a temperature of its own, and the next one where it changes again', () => {
    expect(describeAFlow(changed({ pourTemperature: 88 }))).toContain('Ramps to 10 bar in 10 s, at 88 °C, then pours');
    expect(describeAFlow(changed({ rampTemperature: 90, pourTemperature: 88 }))).toContain(
      'Ramps to 10 bar in 10 s, at 90 °C, then pours at 2 ml/s, rising to 4 ml/s over 60 s, at 88 °C.',
    );
    expect(describeAFlow(changed({ infuseTemperature: 90 }))).toContain(
      'for 60 s or until 3.6 g, at 90 °C. Ramps to 10 bar in 10 s, at 93 °C,',
    );
  });

  it('names an infuse weight, and the flow limit only while it is on', () => {
    expect(describeAFlow(changed({ infuseWeight: 4.5, infuseFlowLimit: 0 }))).toContain('Infuses at 3 bar, for 60 s or until 4.5 g.');
    expect(describeAFlow(changed({ infuseWeight: 0 }))).toContain('Infuses at 3 bar, 1 ml/s at most, for 60 s.');
  });

  it('names a pressure limit of its own, not the one that follows the pour pressure or is off', () => {
    expect(describeAFlow(changed({ pourPressureLimit: 8 }))).toContain('rising to 4 ml/s over 60 s, at most 8 bar.');
    expect(describeAFlow(changed({ pourPressureLimit: 0 }))).not.toContain('at most 0');
    expect(describeAFlow(medium)).not.toMatch(/at most \d+ bar/);
  });

  it('pours at once without a ramp', () => {
    expect(describeAFlow(changed({ rampTime: 0 }))).toContain('3.6 g. Pours at once at 2 ml/s, rising to 4 ml/s over 60 s.');
  });

  it('writes whole numbers without a decimal point and others with one, a space before the unit', () => {
    const text = describeAFlow(changed({ dose: 18.5, stopWeight: 40.04, fillTemperature: 92.46, infusePressure: 2.95, rampTime: 7 }));
    expect(text).toMatch(
      /^18\.5 g in, 40 g out, a ratio of 1:2\.2\. Fills at 8 ml\/s until 3 bar or 15 s, at 92\.5 °C\. Infuses at 3 bar,/,
    );
    expect(text).not.toMatch(/\d\.0\b|\d[a-z°]/);
  });

  it('has three to five sentences, never undefined, NaN or null, for every A-Flow profile Decaid bundles', () => {
    const read = (bundled as unknown as StoredProfile[]).map((profile) => readSteps(profile)).filter((result) => result.ok);
    expect(read.length).toBeGreaterThan(0);
    for (const params of [...read.map((result) => result.params), ...DEFAULT_PROFILES.map((entry) => entry.params)]) {
      const text = describeAFlow(params);
      expect(text).not.toMatch(/undefined|NaN|null/);
      expect(text.length).toBeLessThan(450);
      expect(text.split('. ').length).toBeGreaterThanOrEqual(3);
      expect(text.split('. ').length).toBeLessThanOrEqual(5);
    }
  });
});
