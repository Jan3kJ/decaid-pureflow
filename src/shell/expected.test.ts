import { describe, expect, it } from 'vitest';
import type { Profile, ShotMeasurement } from '../api';
import { DEFAULT_PROFILES } from '../aflow';
import { drawnShotSeconds } from '../editor/curve';
import { workflowProfile } from '../editor/storage';
import type { ShotCache } from '../history/shots.svelte';
import { expectedShotSeconds, lastShotSeconds, profileSeconds } from './expected';
import { defaultProfile } from './profiles';

const medium = DEFAULT_PROFILES.find((entry) => entry.id === 'default-medium')!;
/** The A-Flow default as the workflow holds it: the parameters in its notes. */
const aflow = workflowProfile(defaultProfile(medium), medium.params);

function stepProfile(seconds: number[]): Profile {
  return {
    title: 'Steps',
    target_weight: 36,
    target_volume_count_start: 0,
    tank_temperature: 0,
    steps: seconds.map((s, i) => ({
      name: `step ${i}`,
      pump: 'pressure',
      transition: 'fast',
      exit: null,
      volume: 0,
      seconds: s,
      weight: 0,
      temperature: 93,
      sensor: 'coffee',
      pressure: 9,
      limiter: null,
    })),
  };
}

describe('profileSeconds', () => {
  it("is the A-Flow editor's drawn length for an A-Flow 3.0 profile", () => {
    const seconds = profileSeconds(aflow)!;
    expect(seconds).toBe(drawnShotSeconds(medium.params));
    // The phases before the pour and 30 s of pour.
    expect(seconds).toBeGreaterThan(30);
    expect(seconds).toBeLessThan(90);
  });

  it("is the step editor's curve for another profile: a step without time counts 10 s", () => {
    expect(profileSeconds(stepProfile([8, 25]))).toBe(33);
    expect(profileSeconds(stepProfile([8, 0]))).toBe(18);
    expect(profileSeconds(stepProfile([]))).toBeNull();
  });
});

describe('expectedShotSeconds', () => {
  it('starts at the last shot with the profile, rounded up to 10 s', () => {
    expect(expectedShotSeconds(aflow, 54.3)).toBe(60);
    expect(expectedShotSeconds(stepProfile([8, 25]), 27.7)).toBe(30);
  });

  it("takes the profile's estimate without a last shot, and 30 s without either", () => {
    expect(expectedShotSeconds(stepProfile([8, 25]), null)).toBe(40);
    expect(expectedShotSeconds(aflow, null)).toBe(Math.ceil(drawnShotSeconds(medium.params) / 10) * 10);
    expect(expectedShotSeconds(stepProfile([]), null)).toBe(30);
    expect(expectedShotSeconds(null, null)).toBe(30);
  });
});

describe('lastShotSeconds', () => {
  const measurement = (seconds: number, substate = 'pouring'): ShotMeasurement => ({
    machine: {
      timestamp: new Date(Date.UTC(2026, 9, 19, 8, 0, 0) + seconds * 1000).toISOString().replace('Z', ''),
      state: { state: 'espresso', substate },
      flow: 2,
      pressure: 9,
      targetFlow: 0,
      targetPressure: 0,
      mixTemperature: 90,
      groupTemperature: 92,
      targetMixTemperature: 93,
      targetGroupTemperature: 93,
      profileFrame: 0,
      steamTemperature: 150,
    },
    scale: null,
  });

  it('takes the newest shot with the title the skin holds and measures it as its graph draws it', async () => {
    const asked: unknown[] = [];
    const shots = {
      latestWithTitle: (title: string) => {
        asked.push(title);
        return Promise.resolve({ id: 'shot-1', timestamp: '2026-10-19T08:00:00' });
      },
      record: (id: string) =>
        Promise.resolve({
          id,
          timestamp: '2026-10-19T08:00:00',
          measurements: [
            measurement(0, 'preparingForShot'),
            measurement(4),
            measurement(52.5),
            measurement(52.6, 'pouringDone'),
            measurement(57, 'pouringDone'),
          ],
        }),
    } as unknown as ShotCache;
    expect(await lastShotSeconds(shots, 'A-Flow / default-medium')).toBeCloseTo(48.5, 5);
    expect(asked).toEqual(['A-Flow / default-medium']);
  });

  it('is null without a shot of that title', async () => {
    const shots = { latestWithTitle: () => Promise.resolve(null) } as unknown as ShotCache;
    expect(await lastShotSeconds(shots, 'nothing')).toBeNull();
  });
});
