import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile } from '../aflow';
import { NOTICE_MS, exitText, noticeLasts } from './status';

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
