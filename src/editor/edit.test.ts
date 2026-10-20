import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile, hasSecondFill, resolveParams, validateParams, type AFlowParams } from '../aflow';
import { dragValue, setValue, toggleFlow, toggleSecondFill } from './edit';

const light: AFlowParams = DEFAULT_PROFILES.find((p) => p.id === 'default-light')!.params;
const floral: AFlowParams = DEFAULT_PROFILES.find((p) => p.id === 'default-floral')!.params;

const temperatures = (p: AFlowParams) => {
  const r = resolveParams(p);
  return [r.fillTemperature, r.infuseTemperature, r.secondFillTemperature, r.rampTemperature, r.pourTemperature];
};

describe('setValue (detail mode)', () => {
  it('sets one value and leaves the given parameters alone', () => {
    const next = setValue(light, 'infuseTime', 10);
    expect(next.infuseTime).toBe(10);
    expect(light.infuseTime).toBe(60);
    expect({ ...next, infuseTime: 60 }).toEqual(light);
  });

  it('edits each phase temperature by itself', () => {
    // floral: 95 everywhere, every follower still null.
    expect(temperatures(floral)).toEqual([95, 95, 95, 95, 95]);
    const fill = setValue(floral, 'fillTemperature', 97);
    expect(temperatures(fill)).toEqual([97, 95, 95, 95, 95]);
    const infuse = setValue(fill, 'infuseTemperature', 93);
    expect(temperatures(infuse)).toEqual([97, 93, 95, 95, 95]);
    const second = setValue(infuse, 'secondFillTemperature', 91);
    expect(temperatures(second)).toEqual([97, 93, 91, 95, 95]);
    const flow = setValue(second, 'pourTemperature', 88);
    expect(temperatures(flow)).toEqual([97, 93, 91, 95, 88]);
    const ramp = setValue(flow, 'rampTemperature', 90);
    expect(temperatures(ramp)).toEqual([97, 93, 91, 90, 88]);
  });

  it('keeps the flow toggle true to an end flow of its own', () => {
    expect(setValue(light, 'pourEndFlow', 1).flowUp).toBe(false);
    expect(setValue({ ...light, flowUp: false }, 'pourEndFlow', 5).flowUp).toBe(true);
  });

  it('leaves the max. pressure following the target pressure', () => {
    const next = setValue(light, 'pourPressure', 8);
    expect(next.pourPressureLimit).toBeNull();
    expect(resolveParams(next).pourPressureLimit).toBe(8);
  });
});

describe('dragValue (a line on the graph)', () => {
  it('sets a value that is no temperature', () => {
    expect(dragValue(light, 'infusePressure', 4.2)).toEqual({ ...light, infusePressure: 4.2 });
  });

  it('moves the fill temperature with infuse and 2nd fill, and not the flow group', () => {
    expect(temperatures(dragValue(floral, 'fillTemperature', 92))).toEqual([92, 92, 92, 95, 95]);
    expect(temperatures(dragValue(floral, 'pourTemperature', 90))).toEqual([95, 95, 95, 90, 90]);
  });

  it('leaves following temperatures following', () => {
    const next = dragValue(floral, 'fillTemperature', 92);
    expect(next.infuseTemperature).toBeNull();
    expect(next.secondFillTemperature).toBeNull();
  });

  it('keeps the distances detail mode set between the phases', () => {
    const detail: AFlowParams = {
      ...floral,
      fillTemperature: 96,
      infuseTemperature: 93,
      secondFillTemperature: 91.5,
      rampTemperature: 90,
      pourTemperature: 88,
    };
    expect(temperatures(dragValue(detail, 'fillTemperature', 94))).toEqual([94, 91, 89.5, 90, 88]);
    expect(temperatures(dragValue(detail, 'pourTemperature', 90.5))).toEqual([96, 93, 91.5, 92.5, 90.5]);
  });

  it('keeps a 2nd fill temperature that follows a set infuse temperature with it', () => {
    const detail: AFlowParams = { ...floral, infuseTemperature: 90 };
    expect(temperatures(dragValue(detail, 'fillTemperature', 97))).toEqual([97, 92, 92, 95, 95]);
  });

  it('stops the whole group where one of its lines reaches the end of the range', () => {
    const detail: AFlowParams = { ...floral, fillTemperature: 100, infuseTemperature: 60 };
    // Down: infuse reaches 50 after 10 °C. Up: fill reaches 105 after 5 °C.
    expect(temperatures(dragValue(detail, 'fillTemperature', 50)).slice(0, 2)).toEqual([90, 50]);
    expect(temperatures(dragValue(detail, 'fillTemperature', 105)).slice(0, 2)).toEqual([105, 65]);
    expect(validateParams(dragValue(detail, 'fillTemperature', 50))).toEqual([]);
  });
});

describe('toggles', () => {
  it('switches the 2nd fill on at 15 s and off', () => {
    const on = toggleSecondFill(light);
    expect(on.pauseDuration).toBe(15);
    expect(hasSecondFill(toggleSecondFill(on))).toBe(false);
  });

  it('flips the flow and lets the end flow follow the toggle again', () => {
    const own = setValue(light, 'pourEndFlow', 4);
    const flipped = toggleFlow(own);
    expect(flipped.flowUp).toBe(false);
    expect(flipped.pourEndFlow).toBeNull();
    expect(resolveParams(flipped).pourEndFlow).toBe(0);
  });
});

describe('edits and the generator', () => {
  it('a profile edited in both ways stays valid and generates', () => {
    let p = setValue(floral, 'infuseTemperature', 92);
    p = dragValue(p, 'fillTemperature', 99);
    p = setValue(p, 'pourPressureLimit', 10);
    p = toggleFlow(toggleSecondFill(p));
    expect(validateParams(p)).toEqual([]);
    const steps = generateProfile(p, { title: 'test' }).steps;
    expect(steps.find((s) => s.name === 'Fill')!.temperature).toBe(99);
    expect(steps.find((s) => s.name === 'Infuse')!.temperature).toBe(96);
  });
});
