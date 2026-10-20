import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile } from '../aflow';
import { NOTICE_MS, convertedNotice, exitText, noticeLasts } from './status';

describe("the A-Flow editor's status line", () => {
  it('lets a result go after 4 s and keeps a failure', () => {
    expect(NOTICE_MS).toBe(4000);
    expect(noticeLasts({ tone: 'info', text: 'Saved “mine” and loaded.' })).toBe(4000);
    expect(noticeLasts({ tone: 'warn', text: 'The profile was not saved: 500' })).toBeNull();
  });
});

describe('the exit column of the profile steps', () => {
  const { steps, target_weight } = generateProfile(DEFAULT_PROFILES[0].params, { title: 't' });
  const last = steps.length - 1;
  const column = steps.map((step, index) => exitText(step, index === last ? target_weight : null));

  it('writes the stop weight in the last step, the flow step, and nowhere else', () => {
    expect(steps[last].pump).toBe('flow');
    expect(column[last]).toContain(`stops at ${target_weight} g`);
    expect(column.slice(0, last).some((text) => text.includes('stops at'))).toBe(false);
  });

  it('keeps the exit conditions and step weights', () => {
    const fill = steps.findIndex((step) => step.name === 'Fill');
    expect(column[fill]).toBe('pressure over 3 bar');
    const infuse = steps.findIndex((step) => step.name === 'Infuse');
    expect(column[infuse]).toMatch(/^weight [\d.]+ g$/);
    expect(exitText({ ...steps[fill], exit: undefined, weight: 0 }, null)).toBe('-');
  });
});

describe('the line an older A-Flow profile opens with', () => {
  it('names what was dropped and stays; Pre Fill only while the workaround is off', () => {
    expect(convertedNotice(['preFill', 'rampDown'], false)).toEqual({
      tone: 'warn',
      text: 'An older A-Flow profile, read without Pre Fill and ramp down, which 3.0 has not got; ‘save’ stores it as A-Flow 3.0.',
    });
    expect(convertedNotice(['preFill', 'rampDown', 'pause'], true).text).toContain(
      'without ramp down and the Pause without a 2nd fill,',
    );
    expect(convertedNotice(['preFill', 'pause', 'infuseVolume'], false).text).toContain(
      'Pre Fill, the Pause without a 2nd fill and the infuse volume',
    );
    expect(noticeLasts(convertedNotice(['rampDown'], false))).toBeNull();
  });

  it('with nothing dropped, only that save converts it, for 4 s', () => {
    expect(convertedNotice([], false)).toEqual({ tone: 'info', text: 'An older A-Flow profile: ‘save’ stores it as A-Flow 3.0.' });
    expect(convertedNotice(['preFill'], true).tone).toBe('info');
  });
});
