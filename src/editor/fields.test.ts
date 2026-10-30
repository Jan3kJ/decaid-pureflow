import { describe, expect, it } from 'vitest';
import { machineLimits } from '../aflow';
import { snap } from './fields';

describe('snap', () => {
  it('holds a flow at the maximum flow of the settings', () => {
    expect(snap('pourFlow', 15)).toBe(8);
    expect(snap('pourFlow', 15, machineLimits(12))).toBe(12);
    expect(snap('pourFlow', 11.5, machineLimits(12))).toBe(11.5);
    expect(snap('fillFlow', 30, machineLimits(20))).toBe(20);
    // A flow saved above a lowered maximum comes down to it with the first step.
    expect(snap('pourFlow', 10 + 0.1, machineLimits(8))).toBe(8);
    // Pressure keeps its 12 bar.
    expect(snap('pourPressure', 15, machineLimits(20))).toBe(12);
  });
});
