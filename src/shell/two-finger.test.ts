import { describe, expect, it } from 'vitest';
import { appSleepOf, twoFingerDown, type Finger } from './two-finger';

const finger = (x: number, y: number, dx: number, dy: number): Finger => ({ start: { x, y }, now: { x: x + dx, y: y + dy } });

describe('twoFingerDown', () => {
  it('is two fingers that both went far down', () => {
    expect(twoFingerDown(finger(400, 200, 5, 300), finger(500, 200, -5, 280), 50, 1000)).toBe(true);
  });
  it('is not a short move', () => {
    expect(twoFingerDown(finger(400, 200, 0, 100), finger(500, 200, 0, 300), 50, 1000)).toBe(false);
  });
  it('is not a move up or a slanted one', () => {
    expect(twoFingerDown(finger(400, 500, 0, -300), finger(500, 500, 0, 300), 50, 1000)).toBe(false);
    expect(twoFingerDown(finger(400, 200, 300, 300), finger(500, 200, 0, 300), 50, 1000)).toBe(false);
  });
  it('is not two fingers that went down far apart in time', () => {
    expect(twoFingerDown(finger(400, 200, 0, 300), finger(500, 200, 0, 300), 900, 1000)).toBe(false);
  });
});

describe('appSleepOf', () => {
  it('asks the machine too while it is awake', () => {
    expect(appSleepOf(false, false, true)).toBe('machine-and-app');
  });
  it('sleeps only the app while the machine sleeps and the app is awake', () => {
    expect(appSleepOf(true, false, false)).toBe('app');
  });
  it('does nothing during a run, or when the app already sleeps', () => {
    expect(appSleepOf(false, false, false)).toBe('none');
    expect(appSleepOf(true, true, false)).toBe('none');
  });
});
