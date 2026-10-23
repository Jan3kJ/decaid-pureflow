import { describe, expect, it } from 'vitest';
import { SMOOTH_JUMP, smooth, type Smoothed } from './smooth';

// The state line's temperature filter (spec 3.12, Y10; acceptance 90): an exponential moving
// average with a time constant of 1.5 s that restarts on a stale value and on a jump.

/** ms between two frames: the machine sends 4 a second */
const FRAME_MS = 250;

/** A fixed noise in ±`size`, the same in every run. */
function noise(size: number): () => number {
  let seed = 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 2 * size;
  };
}

/** The filter over `values`, one frame every `FRAME_MS` from `from`; every filtered value. */
function run(values: number[], from: Smoothed | null = null, start = 0): Smoothed[] {
  const out: Smoothed[] = [];
  let last = from;
  values.forEach((value, i) => {
    last = smooth(last, start + i * FRAME_MS, value);
    out.push(last);
  });
  return out;
}

const frames = (seconds: number, value: (i: number) => number) =>
  Array.from({ length: (seconds * 1000) / FRAME_MS }, (_, i) => value(i));

describe('smooth', () => {
  it('starts from the first value', () => {
    expect(smooth(null, 1000, 92.4)).toEqual({ t: 1000, value: 92.4 });
  });

  it('keeps a steady value', () => {
    const out = run(frames(10, () => 93));
    expect(out.every((s) => s.value === 93)).toBe(true);
  });

  it('stays within 0.1 °C of the mean of a noise 0.3 °C wide at 4 frames a second after 3 s', () => {
    const next = noise(0.15);
    const out = run(frames(60, () => 93 + next()));
    for (const s of out.filter((s) => s.t >= 3000)) expect(Math.abs(s.value - 93)).toBeLessThan(0.1);
  });

  it('halves at least the largest swing of a noise of ±0.3 °C', () => {
    const next = noise(0.3);
    const values = frames(60, () => 93 + next());
    const swing = (list: number[]) => Math.max(...list.slice(12).map((v) => Math.abs(v - 93)));
    expect(swing(values)).toBeGreaterThan(0.29);
    expect(swing(run(values).map((s) => s.value))).toBeLessThan(0.15);
  });

  it('changes the one-decimal value of a noisy steady group at most once a second', () => {
    const next = noise(0.3);
    const shown = run(frames(60, () => 93.02 + next())).map((s) => s.value.toFixed(1));
    const changes = shown.filter((v, i) => i > 0 && v !== shown[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(60);
  });

  it('follows a step within 5 s', () => {
    const start = run(frames(2, () => 88));
    const out = run(
      frames(5, () => 92),
      start.at(-1),
      2000,
    );
    expect(out[0].value).toBeLessThan(89);
    expect(Math.abs(out.at(-1)!.value - 92)).toBeLessThan(0.2);
  });

  it('follows a step of 10 °C at once: a jump restarts it', () => {
    const last = { t: 0, value: 85 };
    expect(smooth(last, FRAME_MS, 95)).toEqual({ t: FRAME_MS, value: 95 });
    expect(smooth(last, FRAME_MS, 85 - SMOOTH_JUMP - 0.1).value).toBeCloseTo(85 - SMOOTH_JUMP - 0.1, 9);
    // At the limit it still averages.
    expect(smooth(last, FRAME_MS, 85 + SMOOTH_JUMP).value).toBeLessThan(86);
  });

  it('restarts after a gap of 4 s', () => {
    const last = { t: 0, value: 85 };
    expect(smooth(last, 4000, 88)).toEqual({ t: 4000, value: 88 });
    // Within 3 s it averages.
    expect(smooth(last, 2900, 88).value).toBeLessThan(88);
  });

  it('weighs a frame by the time it covers', () => {
    const last = { t: 0, value: 80 };
    expect(smooth(last, 0, 84).value).toBe(80);
    expect(smooth(last, 1500, 84).value).toBeCloseTo(80 + 4 * (1 - Math.exp(-1)), 9);
  });
});
